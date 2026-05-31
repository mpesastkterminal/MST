import { Router } from "express";
import { Role, type BusinessStatus } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  conflict,
  forbidden,
  serviceUnavailable
} from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import { requireRole } from "../../core/middleware/permissions";
import { isSuperAdmin } from "../../core/security/roles";
import { writeAuditLog } from "../audit/audit.service";

export const businessesRouter = Router();

const businessStatuses = new Set<BusinessStatus>([
  "active",
  "suspended",
  "archived"
]);

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field} is required.`);
  }

  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseStatus(value: unknown) {
  const status = String(value);

  if (!businessStatuses.has(status as BusinessStatus)) {
    throw badRequest("status is invalid.");
  }

  return status as BusinessStatus;
}

function pagination(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(query.page_size ?? 25), 1), 100);

  return {
    page,
    page_size: pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}

async function createProvisionedUser(input: {
  email: string;
  full_name: string;
  temporary_password: string;
  business_id: string;
  role: Role;
}) {
  if (input.temporary_password.length < 8) {
    throw badRequest("temporary_password must be at least 8 characters.");
  }

  const db = getSupabaseServiceClient();
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.temporary_password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name,
      business_id: input.business_id,
      role_key: input.role,
      must_change_password: true
    }
  });

  if (error || !data.user) {
    throw conflict(error?.message ?? "Unable to create owner account.");
  }

  return data.user;
}

function ensureBusinessAccess(reqBusinessId: string, activeBusinessId: string, superAdmin: boolean) {
  if (!superAdmin && reqBusinessId !== activeBusinessId) {
    throw forbidden("Business route does not match active tenant context.");
  }
}

async function transactionSummary(businessId: string) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("stk_push_requests")
    .select("status,amount")
    .eq("business_id", businessId);

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
      (total, row) => total + Number(row.amount ?? 0),
      0
    )
  };
}

businessesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    const { page, page_size, from, to } = pagination(req.query);

    if (isSuperAdmin(req.context.user)) {
      let query = db
        .from("businesses")
        .select("id,name,slug,status,created_at,updated_at", { count: "exact" });

      if (typeof req.query.status === "string" && req.query.status !== "all") {
        query = query.eq("status", parseStatus(req.query.status));
      }

      if (typeof req.query.search === "string" && req.query.search.trim()) {
        query = query.or(
          `name.ilike.%${req.query.search.trim()}%,slug.ilike.%${req.query.search.trim()}%`
        );
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        throw serviceUnavailable(error.message);
      }

      res.json({
        businesses: data ?? [],
        pagination: { page, page_size, total: count ?? 0 }
      });
      return;
    }

    const { data, error } = await db
      .from("businesses")
      .select("id,name,slug,status,created_at,updated_at")
      .eq("id", req.context.user.business_id)
      .order("created_at", { ascending: false });

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ businesses: data ?? [], pagination: { page: 1, page_size: 1, total: data?.length ?? 0 } });
  })
);

businessesRouter.post(
  "/",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const name = requireText(req.body?.name, "name");
    const ownerEmail = requireText(req.body?.owner_email, "owner_email");
    const ownerName = requireText(req.body?.owner_full_name, "owner_full_name");
    const temporaryPassword = requireText(
      req.body?.temporary_password,
      "temporary_password"
    );
    const slug = slugify(optionalText(req.body?.slug) ?? name);

    if (!slug) {
      throw badRequest("slug is invalid.");
    }

    const db = getSupabaseServiceClient();
    const { data: business, error: businessError } = await db
      .from("businesses")
      .insert({
        name,
        slug,
        status: "active"
      })
      .select("id,name,slug,status,created_at,updated_at")
      .single();

    if (businessError) {
      if (businessError.code === "23505") {
        throw conflict("A business with this slug already exists.");
      }

      throw serviceUnavailable(businessError.message);
    }

    const owner = await createProvisionedUser({
      email: ownerEmail,
      full_name: ownerName,
      temporary_password: temporaryPassword,
      business_id: business.id,
      role: Role.BusinessOwner
    });

    const { error: userError } = await db.from("app_users").upsert({
      id: owner.id,
      email: ownerEmail,
      full_name: ownerName,
      status: "active",
      must_change_password: true,
      is_super_admin: false
    });

    if (userError) {
      throw serviceUnavailable(userError.message);
    }

    const { data: membership, error: membershipError } = await db
      .from("business_memberships")
      .upsert({
        business_id: business.id,
        user_id: owner.id,
        branch_id: null,
        role_key: Role.BusinessOwner,
        status: "active"
      })
      .select("id")
      .single();

    if (membershipError) {
      throw serviceUnavailable(membershipError.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: business.id,
      action: "business.created",
      entity_type: "business",
      entity_id: business.id,
      metadata: {
        name,
        slug,
        owner_user_id: owner.id,
        owner_email: ownerEmail
      }
    });

    await writeAuditLog({
      context: req.context.user,
      business_id: business.id,
      action: "role.assigned",
      entity_type: "business_membership",
      entity_id: membership.id,
      metadata: {
        user_id: owner.id,
        role_key: Role.BusinessOwner
      }
    });

    res.status(201).json({
      business,
      owner_user_id: owner.id,
      temporary_password_set: true,
      must_change_password: true
    });
  })
);

businessesRouter.get(
  "/:businessId",
  asyncHandler(async (req, res) => {
    const businessId = String(req.params.businessId);
    const superAdmin = isSuperAdmin(req.context.user);

    ensureBusinessAccess(businessId, req.context.user.business_id, superAdmin);

    const db = getSupabaseServiceClient();
    const [
      business,
      owners,
      branches,
      credentials,
      audits,
      transactions
    ] = await Promise.all([
      db
        .from("businesses")
        .select("id,name,slug,status,created_at,updated_at,archived_at")
        .eq("id", businessId)
        .maybeSingle(),
      db
        .from("business_memberships")
        .select("id,user_id,role_key,status,app_users(id,email,full_name,status,must_change_password,last_login_at)")
        .eq("business_id", businessId)
        .eq("role_key", Role.BusinessOwner),
      db
        .from("branches")
        .select("id,name,code,status,created_at,updated_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
      db
        .from("mpesa_credentials")
        .select("id,branch_id,environment,is_active,updated_at")
        .eq("business_id", businessId),
      db
        .from("audit_logs")
        .select("id,action,entity_type,created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(10),
      transactionSummary(businessId)
    ]);

    if (business.error) {
      throw serviceUnavailable(business.error.message);
    }

    if (!business.data) {
      throw badRequest("Business not found.");
    }

    if (owners.error) {
      throw serviceUnavailable(owners.error.message);
    }

    if (branches.error) {
      throw serviceUnavailable(branches.error.message);
    }

    if (credentials.error) {
      throw serviceUnavailable(credentials.error.message);
    }

    if (audits.error) {
      throw serviceUnavailable(audits.error.message);
    }

    res.json({
      business: business.data,
      owner_accounts: owners.data ?? [],
      branches: branches.data ?? [],
      credential_status: {
        active_credentials: (credentials.data ?? []).filter((row) => row.is_active).length,
        total_credentials: credentials.data?.length ?? 0
      },
      transaction_summary: transactions,
      audit_summary: audits.data ?? []
    });
  })
);

businessesRouter.patch(
  "/:businessId",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const businessId = String(req.params.businessId);
    const updates: Record<string, string | null> = {};

    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }

    if (typeof req.body?.slug === "string" && req.body.slug.trim()) {
      updates.slug = slugify(req.body.slug);
    }

    if (req.body?.status !== undefined) {
      updates.status = parseStatus(req.body.status);
      updates.archived_at =
        updates.status === "archived" ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      throw badRequest("No valid business updates provided.");
    }

    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("businesses")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", businessId)
      .select("id,name,slug,status,created_at,updated_at,archived_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action: "business.updated",
      entity_type: "business",
      entity_id: businessId,
      metadata: { updates }
    });

    res.json({ business: data });
  })
);

async function setBusinessStatus(
  context: Express.Request["context"]["user"],
  businessId: string,
  status: BusinessStatus,
  action: string
) {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("businesses")
    .update({
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", businessId)
    .select("id,name,slug,status,created_at,updated_at,archived_at")
    .single();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  await writeAuditLog({
    context,
    business_id: businessId,
    action,
    entity_type: "business",
    entity_id: businessId,
    metadata: { status }
  });

  return data;
}

businessesRouter.post(
  "/:businessId/suspend",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const business = await setBusinessStatus(
      req.context.user,
      String(req.params.businessId),
      "suspended",
      "business.suspended"
    );

    res.json({ business });
  })
);

businessesRouter.post(
  "/:businessId/reactivate",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const business = await setBusinessStatus(
      req.context.user,
      String(req.params.businessId),
      "active",
      "business.reactivated"
    );

    res.json({ business });
  })
);

businessesRouter.post(
  "/:businessId/archive",
  requireRole(Role.SuperAdmin),
  asyncHandler(async (req, res) => {
    const business = await setBusinessStatus(
      req.context.user,
      String(req.params.businessId),
      "archived",
      "business.archived"
    );

    res.json({ business });
  })
);
