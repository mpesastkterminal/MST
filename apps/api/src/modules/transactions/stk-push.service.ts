import { randomUUID } from "node:crypto";

import type { UserContext, TransactionStatus } from "@mst/shared";

import { getEnv } from "../../core/config/env";
import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  conflict,
  serviceUnavailable,
  unauthorized
} from "../../core/errors/http-error";
import {
  DarajaRequestError,
  sendStkPush,
  type StkPushResponse
} from "../mpesa/daraja-client";
import {
  createCallbackToken,
  hashCallbackToken
} from "../mpesa/mpesa-callback-security";
import { normalizeKenyanPhoneNumber } from "../mpesa/mpesa-phone";
import { resolveBranchMpesaCredentials } from "../mpesa/mpesa-credentials.service";
import { writeAuditLog } from "../audit/audit.service";
import { assertTransactionTransition } from "./transaction-state";

interface CreateStkPushInput {
  branch_id: string;
  amount: number;
  phone_number: string;
  account_reference?: string | null;
  description?: string | null;
  idempotency_key: string;
}

type StkTransactionRow = {
  id: string;
  business_id: string;
  branch_id: string;
  status: TransactionStatus;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  response_code: string | null;
  response_description: string | null;
  customer_message: string | null;
  created_at: string;
};

function sanitizeText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function accountReference(value: string | null | undefined, transactionId: string) {
  return sanitizeText(value, 12) ?? `MST${transactionId.replace(/-/g, "").slice(0, 9)}`;
}

function transactionDescription(value: string | null | undefined) {
  return sanitizeText(value, 100) ?? "MST STK Push";
}

function callbackBaseUrl() {
  return getEnv("MST_PUBLIC_API_URL").replace(/\/$/, "");
}

function redactedCallbackUrl(transactionId: string) {
  return `${callbackBaseUrl()}/mpesa/callback/stk/${transactionId}/[redacted]`;
}

function callbackUrl(transactionId: string, token: string) {
  return `${callbackBaseUrl()}/mpesa/callback/stk/${transactionId}/${token}`;
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

async function findExistingIdempotentTransaction(
  businessId: string,
  branchId: string,
  idempotencyKey: string
) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("stk_push_requests")
    .select(
      "id,business_id,branch_id,status,merchant_request_id,checkout_request_id,response_code,response_description,customer_message,created_at"
    )
    .eq("business_id", businessId)
    .eq("branch_id", branchId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  return data as StkTransactionRow | null;
}

function safeDarajaError(error: unknown) {
  if (error instanceof DarajaRequestError) {
    return {
      code: error.code,
      message: error.message,
      status_code: error.statusCode ?? null
    };
  }

  if (error instanceof Error) {
    return {
      code: "daraja_request_error",
      message: error.message,
      status_code: null
    };
  }

  return {
    code: "daraja_request_error",
    message: "Daraja request failed.",
    status_code: null
  };
}

function acceptedByDaraja(response: StkPushResponse) {
  return response.ResponseCode === "0";
}

function requireIdempotencyKey(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw badRequest("Idempotency key is required.");
  }

  if (normalized.length > 120) {
    throw badRequest("Idempotency key must be 120 characters or fewer.");
  }

  return normalized;
}

export async function createStkPushTransaction(
  context: UserContext,
  input: CreateStkPushInput
) {
  if (!context.session) {
    throw unauthorized("STK push requires an active API session.");
  }

  if (!context.session.terminal_id) {
    throw unauthorized("STK push requires an active terminal session.");
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw badRequest("amount must be a positive whole number.");
  }

  const idempotencyKey = requireIdempotencyKey(input.idempotency_key);
  const existing = await findExistingIdempotentTransaction(
    context.business_id,
    input.branch_id,
    idempotencyKey
  );

  if (existing) {
    return {
      transaction: existing,
      replayed: true,
      daraja_call_status: "not_replayed"
    };
  }

  const phoneNumber = normalizeKenyanPhoneNumber(input.phone_number);
  const credentials = await resolveBranchMpesaCredentials(context, input.branch_id);
  const transactionId = randomUUID();
  const rawCallbackToken = createCallbackToken();
  const db = getSupabaseServiceClient();

  const account_reference = accountReference(input.account_reference, transactionId);
  const description = transactionDescription(input.description);

  const { data: created, error: createError } = await db
    .from("stk_push_requests")
    .insert({
      id: transactionId,
      business_id: context.business_id,
      branch_id: input.branch_id,
      session_id: context.session.session_id,
      device_id: context.session.device_id,
      terminal_id: context.session.terminal_id,
      requested_by_user_id: context.user_id,
      credential_id: credentials.id,
      transaction_type: credentials.transaction_type,
      amount: input.amount,
      phone_number: phoneNumber,
      account_reference,
      description,
      status: "pending",
      idempotency_key: idempotencyKey,
      callback_token_hash: hashCallbackToken(rawCallbackToken),
      callback_url: redactedCallbackUrl(transactionId)
    })
    .select(
      "id,business_id,branch_id,status,merchant_request_id,checkout_request_id,response_code,response_description,customer_message,created_at"
    )
    .single();

  if (isUniqueViolation(createError)) {
    const replay = await findExistingIdempotentTransaction(
      context.business_id,
      input.branch_id,
      idempotencyKey
    );

    if (replay) {
      return {
        transaction: replay,
        replayed: true,
        daraja_call_status: "not_replayed"
      };
    }
  }

  if (createError) {
    throw serviceUnavailable(createError.message);
  }

  const transaction = created as StkTransactionRow;

  await writeAuditLog({
    context,
    business_id: context.business_id,
    branch_id: input.branch_id,
    action: "stk_request.created",
    entity_type: "stk_push_request",
    entity_id: transaction.id,
    metadata: {
      amount: input.amount,
      account_reference,
      idempotency_key: idempotencyKey
    }
  });

  await db
    .from("stk_push_requests")
    .update({
      daraja_request_attempts: 1,
      daraja_requested_at: new Date().toISOString()
    })
    .eq("id", transaction.id)
    .eq("business_id", context.business_id);

  let darajaResult: Awaited<ReturnType<typeof sendStkPush>>;

  try {
    darajaResult = await sendStkPush(credentials, {
      amount: input.amount,
      phone_number: phoneNumber,
      callback_url: callbackUrl(transaction.id, rawCallbackToken),
      account_reference,
      transaction_description: description
    });
  } catch (error) {
    const safeError = safeDarajaError(error);

    await db
      .from("stk_push_requests")
      .update({
        status: "failed",
        last_error_code: safeError.code,
        last_error_message: safeError.message,
        failed_at: new Date().toISOString()
      })
      .eq("id", transaction.id)
      .eq("business_id", context.business_id)
      .eq("status", "pending");

    throw conflict(safeError.message, safeError.code);
  }

  const darajaResponse = darajaResult.response;

  if (!acceptedByDaraja(darajaResponse)) {
    assertTransactionTransition("pending", "failed");

    const { data, error } = await db
      .from("stk_push_requests")
      .update({
        status: "failed",
        response_code: darajaResponse.ResponseCode ?? darajaResponse.errorCode ?? null,
        response_description:
          darajaResponse.ResponseDescription ??
          darajaResponse.errorMessage ??
          "Daraja rejected STK request.",
        customer_message: darajaResponse.CustomerMessage ?? null,
        daraja_request_payload_redacted: darajaResult.redacted_payload,
        daraja_response_payload_redacted: darajaResponse,
        last_error_code: darajaResponse.ResponseCode ?? darajaResponse.errorCode ?? null,
        last_error_message:
          darajaResponse.ResponseDescription ??
          darajaResponse.errorMessage ??
          "Daraja rejected STK request.",
        failed_at: new Date().toISOString()
      })
      .eq("id", transaction.id)
      .eq("business_id", context.business_id)
      .select(
        "id,business_id,branch_id,status,merchant_request_id,checkout_request_id,response_code,response_description,customer_message,created_at"
      )
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    return {
      transaction: data as StkTransactionRow,
      replayed: false,
      daraja_call_status: "rejected"
    };
  }

  if (!darajaResponse.MerchantRequestID || !darajaResponse.CheckoutRequestID) {
    await db
      .from("stk_push_requests")
      .update({
        status: "failed",
        daraja_request_payload_redacted: darajaResult.redacted_payload,
        daraja_response_payload_redacted: darajaResponse,
        last_error_code: "daraja_missing_request_identifiers",
        last_error_message: "Daraja accepted response is missing request identifiers.",
        failed_at: new Date().toISOString()
      })
      .eq("id", transaction.id)
      .eq("business_id", context.business_id)
      .eq("status", "pending");

    throw conflict(
      "Daraja accepted response is missing request identifiers.",
      "daraja_missing_request_identifiers"
    );
  }

  assertTransactionTransition("pending", "processing");

  const { data, error } = await db
    .from("stk_push_requests")
    .update({
      status: "processing",
      merchant_request_id: darajaResponse.MerchantRequestID,
      checkout_request_id: darajaResponse.CheckoutRequestID,
      response_code: darajaResponse.ResponseCode ?? null,
      response_description: darajaResponse.ResponseDescription ?? null,
      customer_message: darajaResponse.CustomerMessage ?? null,
      daraja_request_payload_redacted: darajaResult.redacted_payload,
      daraja_response_payload_redacted: darajaResponse,
      daraja_accepted_at: new Date().toISOString()
    })
    .eq("id", transaction.id)
    .eq("business_id", context.business_id)
    .select(
      "id,business_id,branch_id,status,merchant_request_id,checkout_request_id,response_code,response_description,customer_message,created_at"
    )
    .single();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  return {
    transaction: data as StkTransactionRow,
    replayed: false,
    daraja_call_status: "accepted"
  };
}
