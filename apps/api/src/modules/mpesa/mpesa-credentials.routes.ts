import { Router } from "express";
import { Permission } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  serviceUnavailable
} from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBranchParam,
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { writeAuditLog } from "../audit/audit.service";
import { encryptSecret } from "./mpesa-credentials.crypto";

export const mpesaCredentialsRouter = Router({ mergeParams: true });

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field} is required.`);
  }

  return value.trim();
}

function parseEnvironment(value: unknown) {
  if (value === "sandbox" || value === "production") {
    return value;
  }

  throw badRequest("environment must be sandbox or production.");
}

function parseTransactionType(value: unknown) {
  if (
    value === "CustomerPayBillOnline" ||
    value === "CustomerBuyGoodsOnline" ||
    value === undefined
  ) {
    return value ?? "CustomerPayBillOnline";
  }

  throw badRequest("transaction_type is invalid.");
}

mpesaCredentialsRouter.get(
  "/:businessId/branches/:branchId/mpesa-credentials",
  enforceBusinessParam,
  enforceBranchParam,
  requirePermission(Permission.CredentialsManage),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("mpesa_credentials")
      .select("id,business_id,branch_id,environment,shortcode,transaction_type,is_active,key_version,created_at,updated_at")
      .eq("business_id", req.context.user.business_id)
      .eq("branch_id", String(req.params.branchId))
      .order("created_at", { ascending: false });

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ credentials: data ?? [] });
  })
);

mpesaCredentialsRouter.put(
  "/:businessId/branches/:branchId/mpesa-credentials",
  enforceBusinessParam,
  enforceBranchParam,
  requirePermission(Permission.CredentialsManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const branchId = String(req.params.branchId);
    const environment = parseEnvironment(req.body?.environment);
    const transactionType = parseTransactionType(req.body?.transaction_type);
    const shortcode = requireText(req.body?.shortcode, "shortcode");
    const passkey = requireText(req.body?.passkey, "passkey");
    const consumerKey = requireText(req.body?.consumer_key, "consumer_key");
    const consumerSecret = requireText(req.body?.consumer_secret, "consumer_secret");
    const db = getSupabaseServiceClient();

    const { error: deactivateError } = await db
      .from("mpesa_credentials")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("business_id", businessId)
      .eq("branch_id", branchId)
      .eq("environment", environment)
      .eq("is_active", true);

    if (deactivateError) {
      throw serviceUnavailable(deactivateError.message);
    }

    const { data, error } = await db
      .from("mpesa_credentials")
      .insert({
        business_id: businessId,
        branch_id: branchId,
        environment,
        shortcode,
        transaction_type: transactionType,
        encrypted_passkey: encryptSecret(passkey),
        encrypted_consumer_key: encryptSecret(consumerKey),
        encrypted_consumer_secret: encryptSecret(consumerSecret),
        is_active: true
      })
      .select("id,business_id,branch_id,environment,shortcode,transaction_type,is_active,key_version,created_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      branch_id: branchId,
      action: "credentials.updated",
      entity_type: "mpesa_credentials",
      entity_id: data.id,
      metadata: {
        environment,
        shortcode,
        transaction_type: transactionType
      }
    });

    res.status(201).json({ credentials: data });
  })
);
