import { createHash } from "node:crypto";

import type { TransactionStatus } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  forbidden,
  serviceUnavailable
} from "../../core/errors/http-error";
import { maskPhoneNumber } from "./mpesa-phone";
import { verifyCallbackToken } from "./mpesa-callback-security";
import {
  assertTransactionTransition,
  isTerminalTransactionStatus
} from "../transactions/transaction-state";

type StkRequestRow = {
  id: string;
  business_id: string;
  branch_id: string;
  session_id: string | null;
  requested_by_user_id: string | null;
  amount: number;
  phone_number: string;
  status: TransactionStatus;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  callback_token_hash: string | null;
};

type CallbackItem = {
  Name?: string;
  Value?: string | number;
};

type ParsedCallback = {
  merchant_request_id: string;
  checkout_request_id: string;
  result_code: string;
  result_description: string;
  amount: number | null;
  mpesa_receipt_number: string | null;
  phone_number: string | null;
  transaction_date: string | null;
  raw_redacted: unknown;
  fingerprint: string;
};

function redactCallbackPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => redactCallbackPayload(item));
  }

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;

  if (record.Name === "PhoneNumber" && "Value" in record) {
    return {
      ...record,
      Value: maskPhoneNumber(String(record.Value))
    };
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (/phone|msisdn/i.test(key)) {
      redacted[key] = maskPhoneNumber(String(value));
      continue;
    }

    redacted[key] = redactCallbackPayload(value);
  }

  return redacted;
}

function callbackFingerprint(redactedPayload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(redactedPayload))
    .digest("hex");
}

function metadataItems(stkCallback: Record<string, unknown>) {
  const callbackMetadata = stkCallback.CallbackMetadata as
    | { Item?: CallbackItem[] }
    | undefined;

  return Array.isArray(callbackMetadata?.Item) ? callbackMetadata.Item : [];
}

function metadataValue(items: CallbackItem[], name: string) {
  return items.find((item) => item.Name === name)?.Value ?? null;
}

function parseDarajaTransactionDate(value: string | number | null) {
  if (!value) {
    return null;
  }

  const text = String(value);

  if (!/^\d{14}$/.test(text)) {
    return null;
  }

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const hour = Number(text.slice(8, 10));
  const minute = Number(text.slice(10, 12));
  const second = Number(text.slice(12, 14));

  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second)).toISOString();
}

function parseCallbackPayload(payload: unknown): ParsedCallback {
  const body = (payload as { Body?: unknown })?.Body as
    | { stkCallback?: Record<string, unknown> }
    | undefined;
  const stkCallback = body?.stkCallback;

  if (!stkCallback) {
    throw badRequest("Malformed STK callback payload.");
  }

  const merchantRequestId = String(stkCallback.MerchantRequestID ?? "");
  const checkoutRequestId = String(stkCallback.CheckoutRequestID ?? "");
  const resultCode = String(stkCallback.ResultCode ?? "");
  const resultDescription = String(stkCallback.ResultDesc ?? "");

  if (!merchantRequestId || !checkoutRequestId || !resultCode) {
    throw badRequest("STK callback is missing required request identifiers.");
  }

  const items = metadataItems(stkCallback);
  const amountValue = metadataValue(items, "Amount");
  const phoneValue = metadataValue(items, "PhoneNumber");
  const redactedPayload = redactCallbackPayload(payload);

  return {
    merchant_request_id: merchantRequestId,
    checkout_request_id: checkoutRequestId,
    result_code: resultCode,
    result_description: resultDescription,
    amount: amountValue === null ? null : Number(amountValue),
    mpesa_receipt_number:
      metadataValue(items, "MpesaReceiptNumber")?.toString() ?? null,
    phone_number: phoneValue === null ? null : String(phoneValue),
    transaction_date: parseDarajaTransactionDate(
      metadataValue(items, "TransactionDate")
    ),
    raw_redacted: redactedPayload,
    fingerprint: callbackFingerprint(redactedPayload)
  };
}

function callbackStatus(resultCode: string): TransactionStatus {
  return resultCode === "0" ? "success" : "failed";
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

async function insertCallbackLog(
  transaction: StkRequestRow,
  callback: ParsedCallback,
  nextStatus: TransactionStatus
) {
  const db = getSupabaseServiceClient();
  const { error } = await db.from("transaction_logs").insert({
    business_id: transaction.business_id,
    branch_id: transaction.branch_id,
    stk_request_id: transaction.id,
    amount: callback.amount ?? transaction.amount,
    phone_number: callback.phone_number ?? transaction.phone_number,
    mpesa_receipt_number: callback.mpesa_receipt_number,
    result_code: callback.result_code,
    result_description: callback.result_description,
    transaction_date: callback.transaction_date,
    raw_callback_redacted: callback.raw_redacted,
    callback_fingerprint: callback.fingerprint,
    checkout_request_id: callback.checkout_request_id,
    merchant_request_id: callback.merchant_request_id,
    status_from: transaction.status,
    status_to: nextStatus,
    event_type: "stk_callback"
  });

  if (error && !isUniqueViolation(error)) {
    throw serviceUnavailable(error.message);
  }
}

export async function handleStkCallback(
  requestId: string,
  callbackToken: string,
  payload: unknown
) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("stk_push_requests")
    .select(
      "id,business_id,branch_id,session_id,requested_by_user_id,amount,phone_number,status,merchant_request_id,checkout_request_id,callback_token_hash"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  if (!data) {
    throw badRequest("Unknown STK callback transaction.");
  }

  const transaction = data as StkRequestRow;

  if (!verifyCallbackToken(callbackToken, transaction.callback_token_hash)) {
    throw forbidden("Invalid STK callback token.");
  }

  const callback = parseCallbackPayload(payload);

  if (transaction.checkout_request_id !== callback.checkout_request_id) {
    throw badRequest("Callback checkout_request_id does not match transaction.");
  }

  if (
    transaction.merchant_request_id &&
    transaction.merchant_request_id !== callback.merchant_request_id
  ) {
    throw badRequest("Callback merchant_request_id does not match transaction.");
  }

  const nextStatus = callbackStatus(callback.result_code);
  await insertCallbackLog(transaction, callback, nextStatus);

  if (isTerminalTransactionStatus(transaction.status)) {
    return {
      status: "duplicate_or_terminal",
      transaction_id: transaction.id,
      current_state: transaction.status
    };
  }

  assertTransactionTransition(transaction.status, nextStatus);

  const timestamp = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from("stk_push_requests")
    .update({
      status: nextStatus,
      result_code: callback.result_code,
      result_description: callback.result_description,
      mpesa_receipt_number: callback.mpesa_receipt_number,
      transaction_date: callback.transaction_date,
      callback_received_at: timestamp,
      callback_metadata_redacted: callback.raw_redacted,
      completed_at: nextStatus === "success" ? timestamp : null,
      failed_at: nextStatus === "failed" ? timestamp : null,
      last_error_code: nextStatus === "failed" ? callback.result_code : null,
      last_error_message:
        nextStatus === "failed" ? callback.result_description : null
    })
    .eq("id", transaction.id)
    .eq("business_id", transaction.business_id)
    .eq("status", transaction.status)
    .select("id,status,result_code,result_description,mpesa_receipt_number")
    .maybeSingle();

  if (updateError) {
    throw serviceUnavailable(updateError.message);
  }

  if (!updated) {
    return {
      status: "duplicate_or_raced",
      transaction_id: transaction.id
    };
  }

  return {
    status: "updated",
    transaction: updated
  };
}
