import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getEnv, isProduction } from "../../core/config/env";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  const rawKey = getEnv("MST_CREDENTIAL_ENCRYPTION_KEY");

  if (rawKey.startsWith("base64:")) {
    const key = Buffer.from(rawKey.slice("base64:".length), "base64");

    if (key.length !== 32) {
      throw new Error("MST_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes.");
    }

    return key;
  }

  if (isProduction()) {
    throw new Error(
      "MST_CREDENTIAL_ENCRYPTION_KEY must be base64-prefixed in production."
    );
  }

  return createHash("sha256").update(rawKey).digest();
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

export function decryptSecret(payload: string) {
  const [version, iv, tag, encrypted] = payload.split(":");

  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret payload.");
  }

  const decipher = createDecipheriv(
    algorithm,
    encryptionKey(),
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final()
  ]).toString("utf8");
}
