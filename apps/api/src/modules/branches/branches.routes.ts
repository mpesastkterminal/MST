import { Router } from "express";
import { Permission, type BranchStatus } from "@mst/shared";

import {
  createUserSupabaseClient,
  getSupabaseServiceClient
} from "../../core/db/supabase";
import {
  badRequest,
  serviceUnavailable
} from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { writeAuditLog } from "../audit/audit.service";

export const branchesRouter = Router({ mergeParams: true });

const branchStatuses = new Set<BranchStatus>([
  "active",
  "suspended",
  "archived"
]);

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field} is required.`);
  }

  return value.trim();
}

function parseBranchStatus(value: unknown) {
  const status = String(value);

  if (!branchStatuses.has(status as BranchStatus)) {
    throw badRequest("status is invalid.");
  }

  return status as BranchStatus;
}

function numericAmount(value: number | string | null) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function branchTransactionSummary(businessId: string, branchId: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("stk_push_requests")
    .select("status,amount")
    .eq("business_id", businessId)
    .eq("branch_id", branchId);

  if (error) {
    throw serviceUnavailable(error.message);
  }

  const rows = data ?? [];
  const successful = rows.filter((row) => row.status === "success");

  return {
    total_transactions: rows.length,
    successful_transactions: successful.length,
    failed_transactions: rows.filter((row) => row.status === "failed").length,
    total_value_processed: successful.reduce(
      (total, row) => total + numericAmount(row.amount),
      0
    )
  };
}

branchesRouter.get(
  "/:businessId/branches",
  enforceBusinessParam,
  requirePermission(Permission.BranchesRead),
  asyncHandler(async (req, res) => {
    const db = createUserSupabaseClient(req.auth.access_token);
    let query = db
      .from("branches")
      .select("id,business_id,name,code,status,created_at,updated_at,archived_at")
      .eq("business_id", req.context.user.business_id)
      .order("created_at", { ascending: false });

    if (req.context.user.branch_id) {
      query = query.eq("id", req.context.user.branch_id);
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ branches: data ?? [] });
  })
);

branchesRouter.post(
  "/:businessId/branches",
  enforceBusinessParam,
  requirePermission(Permission.BranchesManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const name = requireText(req.body?.name, "name");
    const code = requireText(req.body?.code, "code").toUpperCase();
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from("branches")
      .insert({
        business_id: businessId,
        name,
        code,
        status:
          req.body?.status === undefined
            ? "active"
            : parseBranchStatus(req.body.status)
      })
      .select("id,business_id,name,code,status,created_at,updated_at,archived_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      branch_id: data.id,
      action: "branch.created",
      entity_type: "branch",
      entity_id: data.id,
      metadata: {
        name,
        code
      }
    });

    res.status(201).json({ branch: data });
  })
);

branchesRouter.get(
  "/:businessId/branches/:branchId",
  enforceBusinessParam,
  requirePermission(Permission.BranchesRead),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const branchId = String(req.params.branchId);

    if (req.context.user.branch_id && req.context.user.branch_id !== branchId) {
      throw badRequest("Branch route does not match active branch context.");
    }

    const db = getSupabaseServiceClient();
    const [
      branch,
      credentials,
      users,
      terminals,
      transactionSummary
    ] = await Promise.all([
      db
        .from("branches")
        .select("id,business_id,name,code,status,created_at,updated_at,archived_at")
        .eq("business_id", businessId)
        .eq("id", branchId)
        .maybeSingle(),
      db
        .from("mpesa_credentials")
        .select("id,environment,shortcode,is_active,updated_at")
        .eq("business_id", businessId)
        .eq("branch_id", branchId)
        .order("updated_at", { ascending: false }),
      db
        .from("business_memberships")
        .select("id,user_id,branch_id,role_key,status,app_users(id,email,full_name,status,last_login_at)")
        .eq("business_id", businessId)
        .eq("branch_id", branchId),
      db
        .from("terminals")
        .select("id,device_id,terminal_name,status,last_seen_at,created_at")
        .eq("business_id", businessId)
        .eq("branch_id", branchId)
        .order("last_seen_at", { ascending: false }),
      branchTransactionSummary(businessId, branchId)
    ]);

    if (branch.error) {
      throw serviceUnavailable(branch.error.message);
    }

    if (!branch.data) {
      throw badRequest("Branch not found.");
    }

    if (credentials.error) {
      throw serviceUnavailable(credentials.error.message);
    }

    if (users.error) {
      throw serviceUnavailable(users.error.message);
    }

    if (terminals.error) {
      throw serviceUnavailable(terminals.error.message);
    }

    res.json({
      branch: branch.data,
      credential_status: {
        active_credentials: (credentials.data ?? []).filter((row) => row.is_active).length,
        credentials: credentials.data ?? []
      },
      transaction_summary: transactionSummary,
      assigned_users: users.data ?? [],
      assigned_devices: terminals.data ?? []
    });
  })
);

branchesRouter.patch(
  "/:businessId/branches/:branchId",
  enforceBusinessParam,
  requirePermission(Permission.BranchesManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const branchId = String(req.params.branchId);
    const updates: Record<string, string> = {};

    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }

    if (typeof req.body?.code === "string" && req.body.code.trim()) {
      updates.code = req.body.code.trim().toUpperCase();
    }

    if (req.body?.status !== undefined) {
      updates.status = parseBranchStatus(req.body.status);
    }

    if (Object.keys(updates).length === 0) {
      throw badRequest("No valid branch updates provided.");
    }

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("branches")
      .update({
        ...updates,
        archived_at:
          updates.status === "archived" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("business_id", businessId)
      .eq("id", branchId)
      .select("id,business_id,name,code,status,created_at,updated_at,archived_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      branch_id: branchId,
      action: "branch.updated",
      entity_type: "branch",
      entity_id: branchId,
      metadata: {
        updates
      }
    });

    res.json({ branch: data });
  })
);

async function setBranchStatus(
  context: Express.Request["context"]["user"],
  branchId: string,
  status: BranchStatus,
  action: string
) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("branches")
    .update({
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("business_id", context.business_id)
    .eq("id", branchId)
    .select("id,business_id,name,code,status,created_at,updated_at,archived_at")
    .single();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  await writeAuditLog({
    context,
    business_id: context.business_id,
    branch_id: branchId,
    action,
    entity_type: "branch",
    entity_id: branchId,
    metadata: { status }
  });

  return data;
}

branchesRouter.post(
  "/:businessId/branches/:branchId/suspend",
  enforceBusinessParam,
  requirePermission(Permission.BranchesManage),
  asyncHandler(async (req, res) => {
    const branch = await setBranchStatus(
      req.context.user,
      String(req.params.branchId),
      "suspended",
      "branch.suspended"
    );

    res.json({ branch });
  })
);

branchesRouter.post(
  "/:businessId/branches/:branchId/reactivate",
  enforceBusinessParam,
  requirePermission(Permission.BranchesManage),
  asyncHandler(async (req, res) => {
    const branch = await setBranchStatus(
      req.context.user,
      String(req.params.branchId),
      "active",
      "branch.reactivated"
    );

    res.json({ branch });
  })
);

branchesRouter.post(
  "/:businessId/branches/:branchId/archive",
  enforceBusinessParam,
  requirePermission(Permission.BranchesManage),
  asyncHandler(async (req, res) => {
    const branch = await setBranchStatus(
      req.context.user,
      String(req.params.branchId),
      "archived",
      "branch.archived"
    );

    res.json({ branch });
  })
);
