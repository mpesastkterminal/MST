import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createCallbackToken() {
  return randomBytes(32).toString("hex");
}

export function hashCallbackToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyCallbackToken(token: string, expectedHash: string | null) {
  if (!expectedHash) {
    return false;
  }

  const actual = Buffer.from(hashCallbackToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
