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

export const auditRouter = Router({ mergeParams: true });
export const platformAuditRouter = Router();

function parsePage(value: unknown, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseDate(value: unknown, field: string) {
  if (value === undefined) {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw badRequest(`${field} must be a valid date.`);
  }

  return date.toISOString();
}

auditRouter.get(
  "/:businessId/audit-logs",
  enforceBusinessParam,
  requirePermission(Permission.AuditRead),
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const pageSize = Math.min(parsePage(req.query.page_size, 25), 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const startDate = parseDate(req.query.start_date, "start_date");
    const endDate = parseDate(req.query.end_date, "end_date");
    const db = getSupabaseServiceClient();
    let query = db
      .from("audit_logs")
      .select(
        "id,business_id,branch_id,actor_user_id,session_id,action,entity_type,entity_id,metadata,created_at",
        { count: "exact" }
      )
      .eq("business_id", req.context.user.business_id);

    if (req.context.user.branch_id) {
      query = query.or(
        `branch_id.eq.${req.context.user.branch_id},branch_id.is.null`
      );
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({
      audit_logs: data ?? [],
      pagination: {
        page,
        page_size: pageSize,
        total: count ?? 0
      }
    });
  })
);

platformAuditRouter.get(
  "/audit-logs",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const pageSize = Math.min(parsePage(req.query.page_size, 25), 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const startDate = parseDate(req.query.start_date, "start_date");
    const endDate = parseDate(req.query.end_date, "end_date");
    const db = getSupabaseServiceClient();
    let query = db
      .from("audit_logs")
      .select(
        "id,business_id,branch_id,actor_user_id,session_id,action,entity_type,entity_id,metadata,created_at",
        { count: "exact" }
      );

    if (typeof req.query.business_id === "string") {
      query = query.eq("business_id", req.query.business_id);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({
      audit_logs: data ?? [],
      pagination: {
        page,
        page_size: pageSize,
        total: count ?? 0
      }
    });
  })
);
