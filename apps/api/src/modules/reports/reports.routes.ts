import { Router, type Request } from "express";
import { Permission, Role } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  forbidden,
  serviceUnavailable
} from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission,
  requireRole
} from "../../core/middleware/permissions";
import { isBusinessOwner, isCashier, isSuperAdmin } from "../../core/security/roles";
import { applyTransactionVisibility } from "../transactions/transaction-visibility";

export const reportsRouter = Router({ mergeParams: true });
export const platformReportsRouter = Router();

const allowedStatuses = new Set([
  "pending",
  "processing",
  "success",
  "failed",
  "reversed"
]);
const allowedSortFields = new Set(["created_at", "amount", "status"]);

function parsePagination(req: Request) {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.page_size ?? 25), 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, page_size: pageSize, from, to };
}

function dateFilter(value: unknown, field: string) {
  if (value === undefined) {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw badRequest(`${field} must be a valid date.`);
  }

  return date.toISOString();
}

function statusFilter(value: unknown) {
  if (value === undefined) {
    return null;
  }

  const status = String(value);

  if (!allowedStatuses.has(status)) {
    throw badRequest("status is invalid.");
  }

  return status;
}

function assertBranchFilterAllowed(req: Request, branchId: string | null) {
  if (!branchId) {
    return;
  }

  if (isSuperAdmin(req.context.user) || isBusinessOwner(req.context.user)) {
    return;
  }

  if (req.context.user.branch_id !== branchId) {
    throw forbidden("Branch filter is outside your visibility scope.");
  }
}

function numericAmount(value: number | string | null) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function summarizeRows(rows: Array<{ status: string; amount: number | string | null }>) {
  const summary = new Map<string, { status: string; count: number; amount: number }>();

  for (const row of rows) {
    const current = summary.get(row.status) ?? {
      status: row.status,
      count: 0,
      amount: 0
    };

    current.count += 1;
    current.amount += numericAmount(row.amount);
    summary.set(row.status, current);
  }

  return [...summary.values()];
}

reportsRouter.get(
  "/:businessId/reports/transactions",
  enforceBusinessParam,
  requirePermission(Permission.ReportsRead),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const { page, page_size, from, to } = parsePagination(req);
    const startDate = dateFilter(req.query.start_date, "start_date");
    const endDate = dateFilter(req.query.end_date, "end_date");
    const status = statusFilter(req.query.status);
    const branchId =
      typeof req.query.branch_id === "string" ? req.query.branch_id : null;
    const sortBy = allowedSortFields.has(String(req.query.sort_by))
      ? String(req.query.sort_by)
      : "created_at";
    const sortOrder = req.query.sort_order === "asc" ? "asc" : "desc";

    assertBranchFilterAllowed(req, branchId);

    const db = getSupabaseServiceClient();
    let query = db
      .from("stk_push_requests")
      .select(
        "id,business_id,branch_id,session_id,requested_by_user_id,amount,phone_number,account_reference,status,created_at,checkout_request_id,mpesa_receipt_number",
        { count: "exact" }
      )
      .eq("business_id", businessId);

    query = applyTransactionVisibility(query, req.context.user);

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({
      data: data ?? [],
      pagination: {
        page,
        page_size,
        total: count ?? 0
      }
    });
  })
);

platformReportsRouter.get(
  "/financial-logs",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const { page, page_size, from, to } = parsePagination(req);
    const startDate = dateFilter(req.query.start_date, "start_date");
    const endDate = dateFilter(req.query.end_date, "end_date");
    const status = statusFilter(req.query.status);
    const sortBy = allowedSortFields.has(String(req.query.sort_by))
      ? String(req.query.sort_by)
      : "created_at";
    const sortOrder = req.query.sort_order === "asc" ? "asc" : "desc";
    const db = getSupabaseServiceClient();
    let query = db
      .from("stk_push_requests")
      .select(
        "id,business_id,branch_id,session_id,device_id,terminal_id,requested_by_user_id,amount,phone_number,account_reference,status,created_at,checkout_request_id,mpesa_receipt_number",
        { count: "exact" }
      );

    if (typeof req.query.business_id === "string") {
      query = query.eq("business_id", req.query.business_id);
    }

    if (typeof req.query.branch_id === "string") {
      query = query.eq("branch_id", req.query.branch_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({
      data: data ?? [],
      pagination: {
        page,
        page_size,
        total: count ?? 0
      }
    });
  })
);

reportsRouter.get(
  "/:businessId/reports/status-summaries",
  enforceBusinessParam,
  requirePermission(Permission.ReportsRead),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    let query = db
      .from("stk_push_requests")
      .select("status,amount")
      .eq("business_id", req.context.user.business_id);

    query = applyTransactionVisibility(query, req.context.user);

    const status = statusFilter(req.query.status);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ summaries: summarizeRows(data ?? []) });
  })
);

reportsRouter.get(
  "/:businessId/reports/branch-summaries",
  enforceBusinessParam,
  requirePermission(Permission.ReportsRead),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    let query = db
      .from("stk_push_requests")
      .select("branch_id,status,amount")
      .eq("business_id", req.context.user.business_id);

    query = applyTransactionVisibility(query, req.context.user);

    if (isCashier(req.context.user)) {
      query = query.eq("session_id", req.context.user.session?.session_id ?? "");
    }

    const { data, error } = await query;

    if (error) {
      throw serviceUnavailable(error.message);
    }

    const byBranch = new Map<string, Array<{ status: string; amount: number | string | null }>>();

    for (const row of data ?? []) {
      const rows = byBranch.get(row.branch_id) ?? [];
      rows.push(row);
      byBranch.set(row.branch_id, rows);
    }

    res.json({
      summaries: [...byBranch.entries()].map(([branch_id, rows]) => ({
        branch_id,
        status_summaries: summarizeRows(rows)
      }))
    });
  })
);
