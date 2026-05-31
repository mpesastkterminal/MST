import { Router } from "express";
import { Permission } from "@mst/shared";

import { createUserSupabaseClient } from "../../core/db/supabase";
import { serviceUnavailable } from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import { readHeaderValue } from "../../core/http/read-header";
import {
  enforceBranchParam,
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { createStkPushTransaction } from "./stk-push.service";
import { applyTransactionVisibility } from "./transaction-visibility";

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
        "id,business_id,branch_id,session_id,device_id,terminal_id,requested_by_user_id,amount,phone_number,account_reference,status,created_at"
      )
      .eq("business_id", req.context.user.business_id)
      .order("created_at", { ascending: false })
      .limit(50);

    query = applyTransactionVisibility(query, req.context.user);

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
    const idempotencyKey =
      readHeaderValue(req.headers["idempotency-key"]) ??
      (typeof req.body?.idempotency_key === "string"
        ? req.body.idempotency_key
        : "");

    const result = await createStkPushTransaction(req.context.user, {
      branch_id: branchId,
      amount: Number(req.body?.amount),
      phone_number:
        typeof req.body?.phone_number === "string" ? req.body.phone_number : "",
      account_reference:
        typeof req.body?.account_reference === "string"
          ? req.body.account_reference
          : null,
      description:
        typeof req.body?.description === "string" ? req.body.description : null,
      idempotency_key: idempotencyKey
    });

    res.status(result.replayed ? 200 : 202).json(result);
  })
);
