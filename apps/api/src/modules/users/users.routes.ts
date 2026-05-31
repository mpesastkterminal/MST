import { Router } from "express";
import { Permission, Role, type UserStatus } from "@mst/shared";

import { getSupabaseServiceClient } from "../../core/db/supabase";
import {
  badRequest,
  conflict,
  forbidden,
  serviceUnavailable
} from "../../core/errors/http-error";
import { asyncHandler } from "../../core/http/async-handler";
import {
  enforceBusinessParam,
  requirePermission
} from "../../core/middleware/permissions";
import { isBusinessOwner, isSuperAdmin } from "../../core/security/roles";
import { writeAuditLog } from "../audit/audit.service";

export const usersRouter = Router({ mergeParams: true });

const userStatuses = new Set<UserStatus>([
  "invited",
  "active",
  "suspended",
  "disabled"
]);

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field} is required.`);
  }

  return value.trim();
}

function parseRole(value: unknown) {
  if (typeof value !== "string" || !Object.values(Role).includes(value as Role)) {
    throw badRequest("role_key is invalid.");
  }

  return value as Role;
}

function parseStatus(value: unknown) {
  const status = String(value);

  if (!userStatuses.has(status as UserStatus)) {
    throw badRequest("status is invalid.");
  }

  return status as UserStatus;
}

function normalizeBranchId(role: Role, branchId: unknown) {
  if (role === Role.BranchManager || role === Role.Cashier) {
    return requireText(branchId, "branch_id");
  }

  return null;
}

function assertRoleGrantAllowed(actorRoles: Role[], targetRole: Role) {
  if (actorRoles.includes(Role.SuperAdmin)) {
    return;
  }

  if (
    actorRoles.includes(Role.BusinessOwner) &&
    (targetRole === Role.BranchManager || targetRole === Role.Cashier)
  ) {
    return;
  }

  throw forbidden("You cannot assign this role.");
}

async function assertBranchBelongsToBusiness(
  businessId: string,
  branchId: string | null
) {
  if (!branchId) {
    return;
  }

  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("branches")
    .select("id,status")
    .eq("business_id", businessId)
    .eq("id", branchId)
    .maybeSingle();

  if (error) {
    throw serviceUnavailable(error.message);
  }

  if (!data || data.status !== "active") {
    throw badRequest("branch_id does not belong to an active branch in this business.");
  }
}

async function createAuthUser(input: {
  email: string;
  full_name: string;
  temporary_password: string;
  business_id: string;
  branch_id: string | null;
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
      branch_id: input.branch_id,
      role_key: input.role,
      must_change_password: true
    }
  });

  if (error || !data.user) {
    throw conflict(error?.message ?? "Unable to create user account.");
  }

  return data.user;
}

async function revokeUserSessions(input: {
  business_id: string;
  user_id: string;
  device_id?: string;
}) {
  const db = getSupabaseServiceClient();
  let query = db
    .from("app_sessions")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("business_id", input.business_id)
    .eq("user_id", input.user_id)
    .eq("status", "active");

  if (input.device_id) {
    query = query.eq("device_id", input.device_id);
  }

  const { error } = await query;

  if (error) {
    throw serviceUnavailable(error.message);
  }
}

usersRouter.get(
  "/:businessId/users",
  enforceBusinessParam,
  requirePermission(Permission.UsersRead),
  asyncHandler(async (req, res) => {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("business_memberships")
      .select("id,business_id,branch_id,role_key,status,user_id,app_users(id,email,full_name,status,must_change_password,last_login_at,last_activity_at)")
      .eq("business_id", req.context.user.business_id)
      .order("created_at", { ascending: false });

    if (error) {
      throw serviceUnavailable(error.message);
    }

    res.json({ users: data ?? [] });
  })
);

usersRouter.post(
  "/:businessId/users",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const email = requireText(req.body?.email, "email");
    const fullName = requireText(req.body?.full_name, "full_name");
    const temporaryPassword = requireText(
      req.body?.temporary_password,
      "temporary_password"
    );
    const role = parseRole(req.body?.role_key);
    const branchId = normalizeBranchId(role, req.body?.branch_id);

    assertRoleGrantAllowed(req.context.user.roles, role);
    await assertBranchBelongsToBusiness(businessId, branchId);

    const db = getSupabaseServiceClient();
    const authUser = await createAuthUser({
      email,
      full_name: fullName,
      temporary_password: temporaryPassword,
      business_id: businessId,
      branch_id: branchId,
      role
    });

    const { error: userError } = await db.from("app_users").upsert({
      id: authUser.id,
      email,
      full_name: fullName,
      status: "active",
      must_change_password: true,
      is_super_admin: role === Role.SuperAdmin
    });

    if (userError) {
      throw serviceUnavailable(userError.message);
    }

    const { data: membership, error: membershipError } = await db
      .from("business_memberships")
      .upsert({
        business_id: businessId,
        user_id: authUser.id,
        branch_id: branchId,
        role_key: role,
        status: "active"
      })
      .select("id,business_id,user_id,branch_id,role_key,status")
      .single();

    if (membershipError) {
      throw serviceUnavailable(membershipError.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      branch_id: branchId,
      action: "user.created",
      entity_type: "app_user",
      entity_id: authUser.id,
      metadata: {
        email,
        role_key: role,
        must_change_password: true
      }
    });

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      branch_id: branchId,
      action: "role.assigned",
      entity_type: "business_membership",
      entity_id: membership.id,
      metadata: {
        user_id: authUser.id,
        role_key: role
      }
    });

    res.status(201).json({
      user_id: authUser.id,
      membership,
      temporary_password_set: true,
      must_change_password: true
    });
  })
);

usersRouter.post(
  "/:businessId/users/invite",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    req.url = req.url.replace("/invite", "");
    res.status(410).json({
      error: {
        code: "invitation_flow_removed",
        message: "Use POST /businesses/:businessId/users for direct account provisioning."
      }
    });
  })
);

usersRouter.get(
  "/:businessId/users/:userId",
  enforceBusinessParam,
  requirePermission(Permission.UsersRead),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const db = getSupabaseServiceClient();
    const [
      membership,
      sessions,
      terminals
    ] = await Promise.all([
      db
        .from("business_memberships")
        .select("id,business_id,branch_id,role_key,status,user_id,app_users(id,email,full_name,status,must_change_password,last_login_at,last_activity_at)")
        .eq("business_id", businessId)
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("app_sessions")
        .select("id,business_id,branch_id,user_id,device_id,terminal_id,status,last_activity_at,created_at,revoked_at,terminals(id,terminal_name,status,last_seen_at)")
        .eq("business_id", businessId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      db
        .from("terminals")
        .select("id,business_id,branch_id,device_id,terminal_name,status,last_seen_at,created_at")
        .eq("business_id", businessId)
        .order("last_seen_at", { ascending: false })
    ]);

    if (membership.error) {
      throw serviceUnavailable(membership.error.message);
    }

    if (!membership.data) {
      throw badRequest("User is not part of this business.");
    }

    if (sessions.error) {
      throw serviceUnavailable(sessions.error.message);
    }

    if (terminals.error) {
      throw serviceUnavailable(terminals.error.message);
    }

    const userSessions = sessions.data ?? [];
    const deviceIds = new Set(userSessions.map((session) => session.device_id));

    res.json({
      user: membership.data,
      active_sessions: userSessions.filter((session) => session.status === "active"),
      sessions: userSessions,
      device_count: deviceIds.size,
      active_devices: [...deviceIds],
      assigned_devices: (terminals.data ?? []).filter((terminal) =>
        deviceIds.has(terminal.device_id)
      )
    });
  })
);

usersRouter.put(
  "/:businessId/users/:userId/role",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const role = parseRole(req.body?.role_key);
    const branchId = normalizeBranchId(role, req.body?.branch_id);

    assertRoleGrantAllowed(req.context.user.roles, role);
    await assertBranchBelongsToBusiness(businessId, branchId);

    const db = getSupabaseServiceClient();
    const { data: current } = await db
      .from("business_memberships")
      .select("id,role_key,branch_id")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data, error } = await db
      .from("business_memberships")
      .upsert({
        business_id: businessId,
        user_id: userId,
        branch_id: branchId,
        role_key: role,
        status: "active"
      })
      .select("id,business_id,user_id,branch_id,role_key,status")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await db.auth.admin.updateUserById(userId, {
      user_metadata: {
        role_key: role,
        business_id: businessId,
        branch_id: branchId
      }
    });

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      branch_id: branchId,
      action: current ? "role.changed" : "role.assigned",
      entity_type: "business_membership",
      entity_id: data.id,
      metadata: {
        user_id: userId,
        from_role_key: current?.role_key ?? null,
        to_role_key: role,
        from_branch_id: current?.branch_id ?? null,
        to_branch_id: branchId
      }
    });

    res.json({ membership: data });
  })
);

usersRouter.patch(
  "/:businessId/users/:userId/status",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const status = parseStatus(req.body?.status);
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from("app_users")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select("id,email,full_name,status,must_change_password,last_login_at,last_activity_at")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    const { error: membershipError } = await db
      .from("business_memberships")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("business_id", businessId)
      .eq("user_id", userId);

    if (membershipError) {
      throw serviceUnavailable(membershipError.message);
    }

    if (status !== "active") {
      await revokeUserSessions({ business_id: businessId, user_id: userId });
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action:
        status === "active"
          ? "user.reactivated"
          : status === "disabled"
            ? "user.disabled"
            : "user.suspended",
      entity_type: "app_user",
      entity_id: userId,
      metadata: { status }
    });

    res.json({ user: data });
  })
);

usersRouter.post(
  "/:businessId/users/:userId/disable",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    req.body = { ...req.body, status: "disabled" };
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from("app_users")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id,email,full_name,status")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await db
      .from("business_memberships")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("user_id", userId);
    await revokeUserSessions({ business_id: businessId, user_id: userId });
    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action: "user.disabled",
      entity_type: "app_user",
      entity_id: userId,
      metadata: { status: "disabled" }
    });

    res.json({ user: data });
  })
);

usersRouter.post(
  "/:businessId/users/:userId/reactivate",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from("app_users")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id,email,full_name,status")
      .single();

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await db
      .from("business_memberships")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("user_id", userId);
    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action: "user.reactivated",
      entity_type: "app_user",
      entity_id: userId,
      metadata: { status: "active" }
    });

    res.json({ user: data });
  })
);

usersRouter.post(
  "/:businessId/users/:userId/reset-password",
  enforceBusinessParam,
  requirePermission(Permission.UsersManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const temporaryPassword = requireText(
      req.body?.temporary_password,
      "temporary_password"
    );

    if (temporaryPassword.length < 8) {
      throw badRequest("temporary_password must be at least 8 characters.");
    }

    const db = getSupabaseServiceClient();
    const { error: authError } = await db.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      user_metadata: {
        must_change_password: true
      }
    });

    if (authError) {
      throw serviceUnavailable(authError.message);
    }

    const { error } = await db
      .from("app_users")
      .update({
        must_change_password: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await revokeUserSessions({ business_id: businessId, user_id: userId });

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action: "password.reset",
      entity_type: "app_user",
      entity_id: userId,
      metadata: {
        temporary_password_set: true
      }
    });

    res.json({ user_id: userId, temporary_password_set: true });
  })
);

usersRouter.post(
  "/:businessId/users/:userId/sessions/:sessionId/revoke",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const sessionId = String(req.params.sessionId);
    const db = getSupabaseServiceClient();

    const { error } = await db
      .from("app_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .eq("id", sessionId);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action: "session.revoked",
      entity_type: "app_session",
      entity_id: sessionId,
      metadata: { user_id: userId }
    });

    res.status(204).send();
  })
);

usersRouter.post(
  "/:businessId/users/:userId/devices/:deviceId/revoke",
  enforceBusinessParam,
  requirePermission(Permission.SessionsManage),
  asyncHandler(async (req, res) => {
    const businessId = req.context.user.business_id;
    const userId = String(req.params.userId);
    const deviceId = String(req.params.deviceId);
    const db = getSupabaseServiceClient();

    await revokeUserSessions({
      business_id: businessId,
      user_id: userId,
      device_id: deviceId
    });

    const { error } = await db
      .from("terminals")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString()
      })
      .eq("business_id", businessId)
      .eq("device_id", deviceId);

    if (error) {
      throw serviceUnavailable(error.message);
    }

    await writeAuditLog({
      context: req.context.user,
      business_id: businessId,
      action: "device.revoked",
      entity_type: "terminal",
      entity_id: null,
      metadata: { user_id: userId, device_id: deviceId }
    });

    res.status(204).send();
  })
);
