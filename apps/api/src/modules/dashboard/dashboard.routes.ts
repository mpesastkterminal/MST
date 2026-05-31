import { Router } from "express";
import { Permission, Role } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  serviceUnavailable
} from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission,
  requireRole
} from "../../core/middleware/permissions";
import { applyTransactionVisibility } from "../transactions/transaction-visibility";
import { writeAuditLog } from "../audit/audit.service";

export const dashboardRouter = Router({ mergeParams: true });
export const platformDashboardRouter = Router();

const defaultWidgets = [
  "total_transactions",
  "successful_transactions",
  "failed_transactions",
  "success_rate",
  "total_processed_amount",
  "branch_comparison",
  "branch_ranking",
  "recent_transactions",
  "failure_rate",
  "recent_activity"
];

const widgetSet = new Set(defaultWidgets);

type TransactionSummaryRow = {
  id: string;
  branch_id: string;
  status: string;
  amount: number | string | null;
  created_at: string;
  account_reference?: string | null;
};

function numericAmount(value: number | string | null) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function visibleTransactions(context: Express.Request["context"]["user"]) {
  const db = getSupabaseServiceClient();
  let query = db
    .from("stk_push_requests")
    .select("id,branch_id,status,amount,created_at,account_reference")
    .eq("business_id", context.business_id);

  query = applyTransactionVisibility(query, context);

  const { data, error } = await query;

  if (error) {
    throw serviceUnavailable(error.message);
  }

  return (data ?? []) as TransactionSummaryRow[];
}

function summarizeTransactions(transactions: TransactionSummaryRow[]) {
  const totalTransactions = transactions.length;
  const successfulTransactions = transactions.filter(
    (transaction) => transaction.status === "success"
  ).length;
  const failedTransactions = transactions.filter(
    (transaction) => transaction.status === "failed"
  ).length;
  const totalValueProcessed = transactions
    .filter((transaction) => transaction.status === "success")
    .reduce((total, transaction) => total + numericAmount(transaction.amount), 0);

  return {
    total_transactions: totalTransactions,
    successful_transactions: successfulTransactions,
    failed_transactions: failedTransactions,
    success_rate:
      totalTransactions === 0
        ? 0
        : Number(((successfulTransactions / totalTransactions) * 100).toFixed(2)),
    total_value_processed: totalValueProcessed
  };
}

async function branchSummary(
  businessId: string,
  transactions: TransactionSummaryRow[]
) {
  const db = getSupabaseServiceClient();
  const { data: branches, error } = await db
    .from("branches")
    .select("id,name,code,status")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) {
    throw serviceUnavailable(error.message);
  }

  return (branches ?? []).map((branch) => {
    const branchTransactions = transactions.filter(
      (transaction) => transaction.branch_id === branch.id
    );
    const summary = summarizeTransactions(branchTransactions);

    return {
      ...branch,
      ...summary
    };
  });
}

dashboardRouter.get(
  "/:businessId/dashboard",
  enforceBusinessParam,
  requirePermission(Permission.DashboardRead),
  asyncHandler(async (req, res) => {
    const transactions = await visibleTransactions(req.context.user);
    const summary = summarizeTransactions(transactions);
    const branches = await branchSummary(
      req.context.user.business_id,
      transactions
    );
    const recentActivity = transactions
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10);
    const branchRanking = branches
      .slice()
      .sort(
        (a, b) =>
          Number(b.total_value_processed ?? 0) -
          Number(a.total_value_processed ?? 0)
      );

    res.json({
      scope: req.context.user.branch_id ? "branch" : "business",
      kpis: summary,
      branch_summary: branches,
      branch_ranking: branchRanking,
      recent_transactions: recentActivity,
      failure_rate: summary.success_rate === 0
        ? summary.failed_transactions > 0
          ? 100
          : 0
        : Number((100 - summary.success_rate).toFixed(2)),
      recent_activity: recentActivity
    });
  })
);

dashboardRouter.get(
  "/:businessId/dashboard/preferences",
  enforceBusinessParam,
  requirePermission(Permission.DashboardRead),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("dashboard_widget_preferences")
      .select("id,business_id,user_id,widgets")
      .eq("business_id", req.context.user.business_id)
      .eq("user_id", req.context.user.user_id)
      .maybeSingle();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({
      available_widgets: defaultWidgets,
      preferences:
        data ?? {
          business_id: req.context.user.business_id,
          user_id: req.context.user.user_id,
          widgets: defaultWidgets
        }
    });
  })
);

dashboardRouter.put(
  "/:businessId/dashboard/preferences",
  enforceBusinessParam,
  requirePermission(Permission.DashboardRead),
  asyncHandler(async (req, res) => {
    const widgets = req.body?.widgets;

    if (!Array.isArray(widgets)) {
      throw badRequest("widgets must be an array.");
    }

    const normalizedWidgets = widgets
      .map((widget) => String(widget))
      .filter((widget, index, all) => widgetSet.has(widget) && all.indexOf(widget) === index);

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("dashboard_widget_preferences")
      .upsert({
        business_id: req.context.user.business_id,
        user_id: req.context.user.user_id,
        widgets: normalizedWidgets,
        updated_at: new Date().toISOString()
      })
      .select("id,business_id,user_id,widgets")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: req.context.user.business_id,
      action: "dashboard.preferences.updated",
      entity_type: "dashboard_widget_preferences",
      entity_id: data.id,
      metadata: {
        widgets: normalizedWidgets
      }
    });

    res.json({ preferences: data });
  })
);

platformDashboardRouter.get(
  "/dashboard",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (_req, res) => {
    const db = getSupabaseServiceClient();
    const [
      businesses,
      branches,
      transactions,
      activeBusinesses,
      suspendedBusinesses,
      recentActivity
    ] = await Promise.all([
      db.from("businesses").select("id", { count: "exact", head: true }),
      db.from("branches").select("id", { count: "exact", head: true }),
      db
        .from("stk_push_requests")
        .select("id,status,amount,business_id,branch_id,created_at"),
      db
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      db
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("status", "suspended"),
      db
        .from("audit_logs")
        .select("id,business_id,action,entity_type,entity_id,created_at")
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    if (businesses.error) {
      throw serviceUnavailable(businesses.error.message);
    }

    if (branches.error) {
      throw serviceUnavailable(branches.error.message);
    }

    if (transactions.error) {
      throw serviceUnavailable(transactions.error.message);
    }

    if (activeBusinesses.error) {
      throw serviceUnavailable(activeBusinesses.error.message);
    }

    if (suspendedBusinesses.error) {
      throw serviceUnavailable(suspendedBusinesses.error.message);
    }

    if (recentActivity.error) {
      throw serviceUnavailable(recentActivity.error.message);
    }

    const rows = (transactions.data ?? []) as TransactionSummaryRow[];
    const summary = summarizeTransactions(rows);

    res.json({
      total_businesses: businesses.count ?? 0,
      active_businesses: activeBusinesses.count ?? 0,
      suspended_businesses: suspendedBusinesses.count ?? 0,
      total_branches: branches.count ?? 0,
      total_platform_transactions: summary.total_transactions,
      successful_transactions: summary.successful_transactions,
      failed_transactions: summary.failed_transactions,
      platform_transaction_statistics: summary,
      total_platform_transaction_volume: summary.total_value_processed,
      recent_activity: recentActivity.data ?? []
    });
  })
);
