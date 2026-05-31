import { Router } from "express";
import { Permission } from "@mst/shared";

import {
  createUserSupabaseClient,
  getSupabaseServiceClient
} from "../../core/db/supabase";
import { badRequest, serviceUnavailable } from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBranchParam,
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { resolveBranchMpesaCredentials } from "../mpesa/mpesa-credentials.service";

export const transactionsRouter = Router({ mergeParams: true });

transactionsRouter.get(
  "/:businessId/transactions",
  enforceBusinessParam,
  requirePermission(Permission.TransactionsRead),
  asyncHandler(async (req, res) => {
    const db = createUserSupabaseClient(req.auth.access_token);
    let query = db
      .from("stk_push_requests")
      .select(
        "id,business_id,branch_id,amount,phone_number,account_reference,status,created_at"
      )
      .eq("business_id", req.context.user.business_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (req.context.user.branch_id) {
      query = query.eq("branch_id", req.context.user.branch_id);
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ transactions: data ?? [] });
  })
);

transactionsRouter.post(
  "/:businessId/branches/:branchId/stk-push",
  enforceBusinessParam,
  enforceBranchParam,
  requirePermission(Permission.StkPushCreate),
  asyncHandler(async (req, res) => {
    const branchId = String(req.params.branchId);
    const amount = Number(req.body?.amount);
    const phoneNumber =
      typeof req.body?.phone_number === "string" ? req.body.phone_number : "";

    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest("amount must be a positive number.");
    }

    if (!phoneNumber) {
      throw badRequest("phone_number is required.");
    }

    const credentials = await resolveBranchMpesaCredentials(req.context.user, branchId);

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("stk_push_requests")
      .insert({
        business_id: req.context.user.business_id,
        branch_id: branchId,
        session_id: req.context.user.session?.session_id ?? null,
        requested_by_user_id: req.context.user.user_id,
        amount,
        phone_number: phoneNumber,
        account_reference:
          typeof req.body?.account_reference === "string"
            ? req.body.account_reference
            : null,
        description:
          typeof req.body?.description === "string" ? req.body.description : null,
        status: "pending"
      })
      .select("id,business_id,branch_id,status,created_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.status(202).json({
      stk_request: data,
      mpesa: {
        shortcode: credentials.shortcode,
        environment: credentials.environment,
        daraja_call_status: "not_started"
      },
      message: "STK request recorded. Daraja execution is intentionally deferred."
    });
  })
);
