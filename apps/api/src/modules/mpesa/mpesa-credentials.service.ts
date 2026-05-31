import type { UserContext } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import { conflict, forbidden, serviceUnavailable } from "../../core/errors/http-error";
import { decryptSecret } from "./mpesa-credentials.crypto";

export interface BranchMpesaCredentials {
  id: string;
  business_id: string;
  branch_id: string;
  environment: "sandbox" | "production";
  shortcode: string;
  transaction_type: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  passkey: string;
  consumer_key: string;
  consumer_secret: string;
}

export async function resolveBranchMpesaCredentials(
  context: UserContext,
  branchId: string
): Promise<BranchMpesaCredentials> {
  if (context.branch_id && context.branch_id !== branchId) {
    throw forbidden("Branch credential lookup is outside active branch context.");
  }

  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("mpesa_credentials")
    .select(
      "id,business_id,branch_id,environment,shortcode,transaction_type,encrypted_passkey,encrypted_consumer_key,encrypted_consumer_secret"
    )
    .eq("business_id", context.business_id)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  if (!data) {
    throw conflict("No active M-Pesa credentials found for this branch.", "mpesa_credentials_missing");
  }

  return {
    id: data.id,
    business_id: data.business_id,
    branch_id: data.branch_id,
    environment: data.environment,
    shortcode: data.shortcode,
    transaction_type: data.transaction_type,
    passkey: decryptSecret(data.encrypted_passkey),
    consumer_key: decryptSecret(data.encrypted_consumer_key),
    consumer_secret: decryptSecret(data.encrypted_consumer_secret)
  };
}
