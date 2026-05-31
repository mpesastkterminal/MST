import { randomUUID } from "node:crypto";

import { Router } from "express";

import { createUserSupabaseClient } from "../../core/db/supabase";
import { asyncHandler } from "../../core/http/async-handler";
import { readHeaderValue } from "../../core/http/read-header";
import { badRequest, serviceUnavailable } from "../../core/errors/http-error";

export const authRouter = Router();

authRouter.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const deviceId = readHeaderValue(req.headers["x-mst-device-id"]);

    if (!deviceId) {
      throw badRequest("Missing x-mst-device-id header.");
    }

    const sessionId = randomUUID();
    const db = createUserSupabaseClient(req.auth.access_token);
    const expiresAt =
      typeof req.body?.expires_at === "number" ? req.body.expires_at : null;

    const { data, error } = await db
      .from("app_sessions")
      .insert({
        id: sessionId,
        user_id: req.context.user.user_id,
        business_id: req.context.user.business_id,
        branch_id: req.context.user.branch_id,
        device_id: deviceId,
        status: "active",
        refresh_token_hash: null,
        expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null
      })
      .select("id,user_id,business_id,branch_id,device_id,status,created_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.status(201).json({
      session: {
        session_id: data.id,
        user_id: data.user_id,
        business_id: data.business_id,
        branch_id: data.branch_id,
        device_id: data.device_id
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

    res.status(204).send();
  })
);
