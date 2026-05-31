import type { UserContext } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";

interface WriteAuditLogInput {
  context?: UserContext;
  business_id: string;
  branch_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

function safeMetadata(metadata: Record<string, unknown> = {}) {
  const redactedKeys = new Set([
    "passkey",
    "consumer_key",
    "consumer_secret",
    "password",
    "token",
    "access_token",
    "refresh_token"
  ]);
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    output[key] = redactedKeys.has(key.toLowerCase()) ? "[redacted]" : value;
  }

  return output;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  const db = getSupabaseServiceClient();

  const { error } = await db.from("audit_logs").insert({
    business_id: input.business_id,
    branch_id: input.branch_id ?? null,
    actor_user_id: input.context?.user_id ?? null,
    session_id: input.context?.session?.session_id ?? null,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    ip_address: input.ip_address ?? null,
    user_agent: input.user_agent ?? null,
    metadata: safeMetadata(input.metadata)
  });

  if (error) {
    console.error("Failed to write audit log", {
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      error: error.message
    });
  }
}
