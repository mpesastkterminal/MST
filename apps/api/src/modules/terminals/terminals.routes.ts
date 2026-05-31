import { Router } from "express";
import { Permission } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import { badRequest, serviceUnavailable } from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { writeAuditLog } from "../audit/audit.service";

export const terminalsRouter = Router({ mergeParams: true });

terminalsRouter.get(
  "/:businessId/terminals",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    let query = db
      .from("terminals")
      .select("id,business_id,branch_id,device_id,terminal_name,status,last_seen_at,created_at,updated_at,branches(id,name,code,status)")
      .eq("business_id", req.context.user.business_id)
      .order("last_seen_at", { ascending: false });

    if (req.context.user.branch_id) {
      query = query.eq("branch_id", req.context.user.branch_id);
    } else if (typeof req.query.branch_id === "string") {
      query = query.eq("branch_id", req.query.branch_id);
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({
      terminals: data ?? [],
      summary: {
        active_terminals: (data ?? []).filter((terminal) => terminal.status === "active").length,
        revoked_terminals: (data ?? []).filter((terminal) => terminal.status === "revoked").length
      }
    });
  })
);

terminalsRouter.patch(
  "/:businessId/terminals/:terminalId",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const terminalId = String(req.params.terminalId);
    const updates: Record<string, string> = {};

    if (typeof req.body?.terminal_name === "string" && req.body.terminal_name.trim()) {
      updates.terminal_name = req.body.terminal_name.trim().slice(0, 80);
    }

    if (req.body?.status === "active" || req.body?.status === "revoked") {
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      throw badRequest("No valid terminal updates provided.");
    }

    const db = getSupabaseServiceClient();
    let query = db
      .from("terminals")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("business_id", req.context.user.business_id)
      .eq("id", terminalId);

    if (req.context.user.branch_id) {
      query = query.eq("branch_id", req.context.user.branch_id);
    }

    const { data, error } = await query
      .select("id,business_id,branch_id,device_id,terminal_name,status,last_seen_at,created_at,updated_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: req.context.user.business_id,
      branch_id: data.branch_id,
      action: updates.status === "revoked" ? "device.revoked" : "terminal.updated",
      entity_type: "terminal",
      entity_id: terminalId,
      metadata: { updates, device_id: data.device_id }
    });

    res.json({ terminal: data });
  })
);

terminalsRouter.post(
  "/:businessId/terminals/:terminalId/revoke",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const terminalId = String(req.params.terminalId);
    const db = getSupabaseServiceClient();

    let terminalQuery = db
      .from("terminals")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("business_id", req.context.user.business_id)
      .eq("id", terminalId);

    if (req.context.user.branch_id) {
      terminalQuery = terminalQuery.eq("branch_id", req.context.user.branch_id);
    }

    const { data, error } = await terminalQuery
      .select("id,branch_id,device_id")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    const { error: sessionError } = await db
      .from("app_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("business_id", req.context.user.business_id)
      .eq("terminal_id", terminalId)
      .eq("status", "active");

    if (sessionError) {
      throw serviceUnavailable(sessionError.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: req.context.user.business_id,
      branch_id: data.branch_id,
      action: "device.revoked",
      entity_type: "terminal",
      entity_id: terminalId,
      metadata: { device_id: data.device_id }
    });

    res.status(204).send();
  })
);
