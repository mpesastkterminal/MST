import { Router } from "express";
import { Permission } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import { serviceUnavailable } from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { writeAuditLog } from "../audit/audit.service";

export const sessionsRouter = Router({ mergeParams: true });

sessionsRouter.get(
  "/:businessId/sessions",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    let query = db
      .from("app_sessions")
      .select("id,user_id,business_id,branch_id,device_id,terminal_id,status,last_activity_at,created_at,revoked_at,app_users(id,email,full_name,status),terminals(id,terminal_name,status,last_seen_at)")
      .eq("business_id", req.context.user.business_id)
      .order("created_at", { ascending: false });

    if (req.context.user.branch_id) {
      query = query.eq("branch_id", req.context.user.branch_id);
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    const sessions = data ?? [];
    const activeDevices = new Set(
      sessions
        .filter((session) => session.status === "active")
        .map((session) => session.device_id)
    );

    res.json({
      sessions,
      summary: {
        active_sessions: sessions.filter((session) => session.status === "active").length,
        active_devices: activeDevices.size
      }
    });
  })
);

sessionsRouter.post(
  "/:businessId/sessions/:sessionId/revoke",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const sessionId = String(req.params.sessionId);
    const db = getSupabaseServiceClient();
    let query = db
      .from("app_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("business_id", req.context.user.business_id)
      .eq("id", sessionId);

    if (req.context.user.branch_id) {
      query = query.eq("branch_id", req.context.user.branch_id);
    }

    const { error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: req.context.user.business_id,
      branch_id: req.context.user.branch_id,
      action: "session.revoked",
      entity_type: "app_session",
      entity_id: sessionId,
      metadata: {}
    });

    res.status(204).send();
  })
);

sessionsRouter.post(
  "/:businessId/devices/:deviceId/revoke",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const deviceId = String(req.params.deviceId);
    const db = getSupabaseServiceClient();
    let sessions = db
      .from("app_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("business_id", req.context.user.business_id)
      .eq("device_id", deviceId)
      .eq("status", "active");
    let terminals = db
      .from("terminals")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString()
      })
      .eq("business_id", req.context.user.business_id)
      .eq("device_id", deviceId);

    if (req.context.user.branch_id) {
      sessions = sessions.eq("branch_id", req.context.user.branch_id);
      terminals = terminals.eq("branch_id", req.context.user.branch_id);
    }

    const [sessionResult, terminalResult] = await Promise.all([
      sessions,
      terminals
    ]);

    if (sessionResult.error) {
      throw serviceUnavailable(sessionResult.error.message);
    }

    if (terminalResult.error) {
      throw serviceUnavailable(terminalResult.error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: req.context.user.business_id,
      branch_id: req.context.user.branch_id,
      action: "device.revoked",
      entity_type: "terminal",
      entity_id: null,
      metadata: { device_id: deviceId }
    });

    res.status(204).send();
  })
);
