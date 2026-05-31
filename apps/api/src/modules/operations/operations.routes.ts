import { Router } from "express";
import { Permission, Role } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import { serviceUnavailable } from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission,
  requireRole
} from "../../core/middleware/permissions";
import { applyTransactionVisibility } from "../transactions/transaction-visibility";

export const operationsRouter = Router({ mergeParams: true });
export const platformOperationsRouter = Router();

type TransactionHealthRow = {
  branch_id: string;
  status: string;
  amount: number | string | null;
  callback_received_at?: string | null;
  result_code?: string | null;
  created_at: string;
};

function failureRate(rows: TransactionHealthRow[]) {
  if (rows.length === 0) {
    return 0;
  }

  const failed = rows.filter((row) => row.status === "failed").length;
  return Number(((failed / rows.length) * 100).toFixed(2));
}

function buildWarnings(input: {
  rows: TransactionHealthRow[];
  inactiveBranches: Array<{ id: string; name: string; status: string }>;
  credentialIssues: Array<{ branch_id: string; branch_name: string; issue: string }>;
}) {
  const warnings: Array<{
    code: string;
    severity: "warning" | "critical";
    message: string;
    branch_id?: string;
  }> = [];

  if (input.rows.filter((row) => row.status === "pending").length > 10) {
    warnings.push({
      code: "high_pending_stk_count",
      severity: "warning",
      message: "Pending STK requests are accumulating."
    });
  }

  if (failureRate(input.rows) >= 25 && input.rows.length >= 10) {
    warnings.push({
      code: "high_failure_rate",
      severity: "critical",
      message: "STK failure rate is above 25%."
    });
  }

  for (const branch of input.inactiveBranches) {
    warnings.push({
      code: "inactive_branch",
      severity: "warning",
      message: `${branch.name} is ${branch.status}.`,
      branch_id: branch.id
    });
  }

  for (const issue of input.credentialIssues) {
    warnings.push({
      code: "credential_issue",
      severity: "critical",
      message: issue.issue,
      branch_id: issue.branch_id
    });
  }

  return warnings;
}

async function businessHealth(
  context: Express.Request["context"]["user"],
  businessId: string
) {
  const db = getSupabaseServiceClient();
  let transactionQuery = db
    .from("stk_push_requests")
    .select("branch_id,status,amount,callback_received_at,result_code,created_at")
    .eq("business_id", businessId);

  transactionQuery = applyTransactionVisibility(transactionQuery, context);

  const [transactions, branches, credentials] = await Promise.all([
    transactionQuery,
    db
      .from("branches")
      .select("id,name,status")
      .eq("business_id", businessId),
    db
      .from("mpesa_credentials")
      .select("id,branch_id,is_active,environment,updated_at")
      .eq("business_id", businessId)
  ]);

  if (transactions.error) {
    throw serviceUnavailable(transactions.error.message);
  }

  if (branches.error) {
    throw serviceUnavailable(branches.error.message);
  }

  if (credentials.error) {
    throw serviceUnavailable(credentials.error.message);
  }

  const rows = (transactions.data ?? []) as TransactionHealthRow[];
  const branchRows = branches.data ?? [];
  const activeCredentialBranchIds = new Set(
    (credentials.data ?? [])
      .filter((credential) => credential.is_active)
      .map((credential) => credential.branch_id)
  );
  const credentialIssues = branchRows
    .filter((branch) => branch.status === "active")
    .filter((branch) => !activeCredentialBranchIds.has(branch.id))
    .map((branch) => ({
      branch_id: branch.id,
      branch_name: branch.name,
      issue: `${branch.name} has no active M-Pesa credentials.`
    }));
  const inactiveBranches = branchRows.filter((branch) => branch.status !== "active");
  const failedStkCount = rows.filter((row) => row.status === "failed").length;
  const pendingStkCount = rows.filter((row) => row.status === "pending").length;
  const callbackFailures = rows.filter(
    (row) =>
      row.callback_received_at &&
      row.result_code &&
      row.result_code !== "0"
  ).length;

  return {
    failed_stk_count: failedStkCount,
    pending_stk_count: pendingStkCount,
    callback_failures: callbackFailures,
    credential_issues: credentialIssues,
    inactive_branches: inactiveBranches,
    failure_rate: failureRate(rows),
    warnings: buildWarnings({
      rows,
      inactiveBranches,
      credentialIssues
    })
  };
}

operationsRouter.get(
  "/:businessId/operations/health",
  enforceBusinessParam,
  requirePermission(Permission.OperationsRead),
  asyncHandler(async (req, res) => {
    const health = await businessHealth(
      req.context.user,
      req.context.user.business_id
    );

    res.json({ scope: "business", health });
  })
);

platformOperationsRouter.get(
  "/operations/health",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    const { data: businesses, error } = await db
      .from("businesses")
      .select("id,name,status")
      .neq("status", "archived");

    if (error) {
      throw serviceUnavailable(error.message);
    }

    const businessResults = await Promise.all(
      (businesses ?? []).map(async (business) => ({
        business,
        health: await businessHealth(req.context.user, business.id)
      }))
    );

    res.json({
      scope: "platform",
      businesses: businessResults,
      summary: {
        failed_stk_count: businessResults.reduce(
          (total, item) => total + item.health.failed_stk_count,
          0
        ),
        pending_stk_count: businessResults.reduce(
          (total, item) => total + item.health.pending_stk_count,
          0
        ),
        callback_failures: businessResults.reduce(
          (total, item) => total + item.health.callback_failures,
          0
        ),
        credential_issues: businessResults.reduce(
          (total, item) => total + item.health.credential_issues.length,
          0
        ),
        inactive_branches: businessResults.reduce(
          (total, item) => total + item.health.inactive_branches.length,
          0
        ),
        warnings: businessResults.flatMap((item) => item.health.warnings)
      }
    });
  })
);
