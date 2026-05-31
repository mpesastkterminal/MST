import { createHash } from "node:crypto";

import { serviceUnavailable } from "../../core/errors/http-error";
import type { BranchMpesaCredentials } from "./mpesa-credentials.service";
import { maskPhoneNumber } from "./mpesa-phone";

interface OAuthTokenCacheEntry {
  access_token: string;
  expires_at: number;
}

export interface StkPushRequest {
  amount: number;
  phone_number: string;
  callback_url: string;
  account_reference: string;
  transaction_description: string;
}

export interface StkPushResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface RedactedStkPushPayload {
  BusinessShortCode: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export class DarajaRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
  }
}

const oauthTokenCache = new Map<string, OAuthTokenCacheEntry>();

function darajaBaseUrl(environment: BranchMpesaCredentials["environment"]) {
  return environment === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function formatDarajaTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function createPassword(shortcode: string, passkey: string, timestamp: string) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

function tokenCacheKey(credentials: BranchMpesaCredentials) {
  const keyHash = createHash("sha256")
    .update(credentials.consumer_key)
    .digest("hex")
    .slice(0, 16);

  return `${credentials.environment}:${credentials.id}:${keyHash}`;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const body = await readJsonResponse(response);
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function getOAuthToken(credentials: BranchMpesaCredentials) {
  const cacheKey = tokenCacheKey(credentials);
  const cachedToken = oauthTokenCache.get(cacheKey);
  const now = Date.now();

  if (cachedToken && cachedToken.expires_at > now + 60_000) {
    return cachedToken.access_token;
  }

  const authorization = Buffer.from(
    `${credentials.consumer_key}:${credentials.consumer_secret}`
  ).toString("base64");

  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { response, body } = await fetchJsonWithTimeout(
        `${darajaBaseUrl(credentials.environment)}/oauth/v1/generate?grant_type=client_credentials`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${authorization}`
          }
        },
        20_000
      );

      if (!response.ok) {
        throw new DarajaRequestError(
          "daraja_oauth_http_error",
          "Daraja OAuth request failed.",
          response.status
        );
      }

      if (typeof body.access_token !== "string") {
        throw new DarajaRequestError(
          "daraja_oauth_invalid_response",
          "Daraja OAuth response did not include an access token."
        );
      }

      const expiresIn = Number(body.expires_in ?? 3599);
      oauthTokenCache.set(cacheKey, {
        access_token: body.access_token,
        expires_at: now + Math.max(expiresIn - 60, 60) * 1000
      });

      return body.access_token;
    } catch (error) {
      lastError = error;

      if (attempt === 2) {
        break;
      }
    }
  }

  if (lastError instanceof DarajaRequestError) {
    throw lastError;
  }

  throw serviceUnavailable("Unable to obtain Daraja OAuth token.");
}

export async function sendStkPush(
  credentials: BranchMpesaCredentials,
  request: StkPushRequest
) {
  const accessToken = await getOAuthToken(credentials);
  const timestamp = formatDarajaTimestamp();
  const payload = {
    BusinessShortCode: credentials.shortcode,
    Password: createPassword(credentials.shortcode, credentials.passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: credentials.transaction_type,
    Amount: request.amount,
    PartyA: request.phone_number,
    PartyB: credentials.shortcode,
    PhoneNumber: request.phone_number,
    CallBackURL: request.callback_url,
    AccountReference: request.account_reference,
    TransactionDesc: request.transaction_description
  };

  const redactedPayload: RedactedStkPushPayload = {
    BusinessShortCode: payload.BusinessShortCode,
    Timestamp: payload.Timestamp,
    TransactionType: payload.TransactionType,
    Amount: payload.Amount,
    PartyA: maskPhoneNumber(payload.PartyA) ?? "***",
    PartyB: payload.PartyB,
    PhoneNumber: maskPhoneNumber(payload.PhoneNumber) ?? "***",
    CallBackURL: request.callback_url.replace(/\/[^/]+$/, "/[redacted]"),
    AccountReference: payload.AccountReference,
    TransactionDesc: payload.TransactionDesc
  };

  const { response, body } = await fetchJsonWithTimeout(
    `${darajaBaseUrl(credentials.environment)}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    30_000
  );

  if (!response.ok) {
    throw new DarajaRequestError(
      "daraja_stk_http_error",
      "Daraja STK push request failed.",
      response.status
    );
  }

  return {
    response: body as StkPushResponse,
    redacted_payload: redactedPayload
  };
}
