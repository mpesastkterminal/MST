import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  createUserSupabaseClient,
  getSupabaseServiceClient
} from "../../core/db/supabase";
import { asyncHandler } from "../../core/http/async-handler";
import { readHeaderValue } from "../../core/http/read-header";
import { badRequest, serviceUnavailable } from "../../core/errors/http-error";
import { isCashier } from "../../core/security/roles";
import { writeAuditLog } from "../audit/audit.service";

export const authRouter = Router();

function normalizeTerminalName(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw badRequest("terminal_name must be a non-empty string.");
  }

  return value.trim().slice(0, 80);
}

async function registerTerminal(
  businessId: string,
  branchId: string | null,
  deviceId: string,
  terminalName: string | null,
  required: boolean
) {
  if (!branchId || !required) {
    return null;
  }

  if (!terminalName) {
    throw badRequest("terminal_name is required for branch terminal sessions.");
  }

  const db = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("terminals")
    .upsert(
      {
        business_id: businessId,
        branch_id: branchId,
        device_id: deviceId,
        terminal_name: terminalName,
        status: "active",
        last_seen_at: now,
        updated_at: now
      },
      {
        onConflict: "business_id,branch_id,device_id"
      }
    )
    .select("id,terminal_name,status")
    .single();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  return data;
}

authRouter.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const deviceId = readHeaderValue(req.headers["x-mst-device-id"]);

    if (!deviceId) {
      throw badRequest("Missing x-mst-device-id header.");
    }

    const sessionId = randomUUID();
    const db = createUserSupabaseClient(req.auth.access_token);
    const serviceDb = getSupabaseServiceClient();
    const expiresAt =
      typeof req.body?.expires_at === "number" ? req.body.expires_at : null;
    const terminalRequired = isCashier(req.context.user);
    const terminalName = normalizeTerminalName(req.body?.terminal_name);

    if (terminalRequired && !terminalName) {
      res.status(409).json({
        error: {
          code: "terminal_required",
          message: "Terminal name is required for cashier sessions.",
          request_id: req.context.request_id
        },
        context: req.context.user
      });
      return;
    }

    const terminal = await registerTerminal(
      req.context.user.business_id,
      req.context.user.branch_id,
      deviceId,
      terminalName,
      terminalRequired
    );

    const { data, error } = await db
      .from("app_sessions")
      .insert({
        id: sessionId,
        user_id: req.context.user.user_id,
        business_id: req.context.user.business_id,
        branch_id: req.context.user.branch_id,
        device_id: deviceId,
        terminal_id: terminal?.id ?? null,
        status: "active",
        refresh_token_hash: null,
        expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
        last_activity_at: new Date().toISOString()
      })
      .select("id,user_id,business_id,branch_id,device_id,terminal_id,status,created_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await serviceDb
      .from("app_users")
      .update({
        last_login_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq("id", req.context.user.user_id);

    res.status(201).json({
      session: {
        session_id: data.id,
        user_id: data.user_id,
        business_id: data.business_id,
        branch_id: data.branch_id,
        device_id: data.device_id,
        terminal_id: data.terminal_id,
        terminal_name: terminal?.terminal_name ?? null
      },
      context: req.context.user
    });
  })
);

authRouter.get("/me", (req, res) => {
  res.json({
    user: req.context.user
  });
});

authRouter.post(
  "/password",
  asyncHandler(async (req, res) => {
    const newPassword =
      typeof req.body?.new_password === "string" ? req.body.new_password : "";

    if (newPassword.length < 8) {
      throw badRequest("new_password must be at least 8 characters.");
    }

    const db = getSupabaseServiceClient();
    const { error: authError } = await db.auth.admin.updateUserById(
      req.context.user.user_id,
      {
        password: newPassword,
        user_metadata: {
          must_change_password: false
        }
      }
    );

    if (authError) {
      throw serviceUnavailable(authError.message);
    }

    const { error } = await db
      .from("app_users")
      .update({
        must_change_password: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.context.user.user_id);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: req.context.user.business_id,
      branch_id: req.context.user.branch_id,
      action: "password.changed",
      entity_type: "app_user",
      entity_id: req.context.user.user_id,
      metadata: {}
    });

    res.status(204).send();
  })
);

authRouter.delete(
  "/sessions/current",
  asyncHandler(async (req, res) => {
    const sessionId = req.context.user.session?.session_id;

    if (!sessionId) {
      throw badRequest("No active API session found.");
    }

    const db = createUserSupabaseClient(req.auth.access_token);
    const { error } = await db
      .from("app_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString()
      })
      .eq("id", sessionId)
      .eq("user_id", req.context.user.user_id)
      .eq("business_id", req.context.user.business_id);

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
      metadata: {
        reason: "current_session_logout"
      }
    });

    res.status(204).send();
  })
);
