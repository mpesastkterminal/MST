import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";
import {
  ROLE_PERMISSIONS,
  Role,
  type Permission,
  type RoleAssignment,
  type UserContext
} from "@mst/shared";

import { createUserSupabaseClient } from "../db/supabase";
import {
  badRequest,
  conflict,
  forbidden,
  serviceUnavailable,
  unauthorized
} from "../errors/http-error";
import { readHeaderValue } from "../http/read-header";

type MembershipRow = {
  id: string;
  business_id: string;
  branch_id: string | null;
  role_key: string;
  status: string;
  businesses?: { status?: string } | { status?: string }[] | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  business_id: string;
  branch_id: string | null;
  device_id: string;
  status: string;
};

const branchScopedRoles = new Set<Role>([Role.BranchManager, Role.Cashier]);

function isRole(value: string): value is Role {
  return Object.values(Role).includes(value as Role);
}

function businessStatus(row: MembershipRow) {
  const business = Array.isArray(row.businesses)
    ? row.businesses[0]
    : row.businesses;

  return business?.status ?? "active";
}

function permissionsForRoles(roles: Role[]) {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }

  return [...permissions];
}

function isSessionBootstrapRoute(reqPath: string, method: string) {
  return method === "POST" && reqPath === "/auth/sessions";
}

export const tenantContextMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const request_id = randomUUID();
    res.setHeader("x-request-id", request_id);

    const db = createUserSupabaseClient(req.auth.access_token);
    const selectedBusinessId = readHeaderValue(req.headers["x-mst-business-id"]);
    const selectedBranchId = readHeaderValue(req.headers["x-mst-branch-id"]);
    const deviceId = readHeaderValue(req.headers["x-mst-device-id"]);
    const sessionId = readHeaderValue(req.headers["x-mst-session-id"]);

    const { data: profile, error: profileError } = await db
      .from("app_users")
      .select("id,email,full_name,status,is_super_admin")
      .eq("id", req.auth.user_id)
      .maybeSingle();

    if (profileError) {
      return next(serviceUnavailable(profileError.message));
    }

    if (!profile || profile.status !== "active") {
      return next(forbidden("User profile is not active."));
    }

    const { data: memberships, error: membershipError } = await db
      .from("business_memberships")
      .select("id,business_id,branch_id,role_key,status,businesses(status)")
      .eq("user_id", req.auth.user_id)
      .eq("status", "active");

    if (membershipError) {
      return next(serviceUnavailable(membershipError.message));
    }

    const activeMemberships = ((memberships ?? []) as MembershipRow[]).filter(
      (membership) =>
        isRole(membership.role_key) && businessStatus(membership) === "active"
    );

    if (activeMemberships.length === 0) {
      return next(forbidden("User has no active business membership."));
    }

    let selectedMembership: MembershipRow | undefined;

    if (selectedBusinessId) {
      selectedMembership = activeMemberships.find(
        (membership) => membership.business_id === selectedBusinessId
      );

      if (!selectedMembership) {
        return next(forbidden("User is not a member of the requested business."));
      }
    } else if (activeMemberships.length === 1) {
      selectedMembership = activeMemberships[0];
    } else {
      return next(
        conflict(
          "Multiple business memberships found. Send x-mst-business-id.",
          "business_context_required"
        )
      );
    }

    const role = selectedMembership.role_key as Role;
    let branchId = selectedMembership.branch_id;

    if (selectedBranchId) {
      if (selectedMembership.branch_id && selectedMembership.branch_id !== selectedBranchId) {
        return next(forbidden("User is not assigned to the requested branch."));
      }

      const { data: branch, error: branchError } = await db
        .from("branches")
        .select("id,status")
        .eq("business_id", selectedMembership.business_id)
        .eq("id", selectedBranchId)
        .maybeSingle();

      if (branchError) {
        return next(serviceUnavailable(branchError.message));
      }

      if (!branch || branch.status !== "active") {
        return next(forbidden("Requested branch is not active."));
      }

      branchId = selectedBranchId;
    }

    if (branchScopedRoles.has(role) && !branchId) {
      return next(forbidden("Branch-scoped role requires an active branch context."));
    }

    const roleAssignment: RoleAssignment = {
      business_id: selectedMembership.business_id,
      branch_id: selectedMembership.branch_id,
      role
    };

    const contextUser: UserContext = {
      user_id: req.auth.user_id,
      business_id: selectedMembership.business_id,
      branch_id: branchId,
      roles: [role],
      permissions: permissionsForRoles([role]),
      role_assignments: activeMemberships
        .filter((membership) => isRole(membership.role_key))
        .map((membership) => ({
          business_id: membership.business_id,
          branch_id: membership.branch_id,
          role: membership.role_key as Role
        })),
      session: null
    };

    const isBootstrap = isSessionBootstrapRoute(req.path, req.method);

    if (!deviceId) {
      return next(badRequest("Missing x-mst-device-id header."));
    }

    if (!isBootstrap) {
      if (!sessionId) {
        return next(unauthorized("Missing x-mst-session-id header."));
      }

      const { data: session, error: sessionError } = await db
        .from("app_sessions")
        .select("id,user_id,business_id,branch_id,device_id,status")
        .eq("id", sessionId)
        .eq("user_id", req.auth.user_id)
        .eq("business_id", selectedMembership.business_id)
        .eq("device_id", deviceId)
        .eq("status", "active")
        .maybeSingle();

      if (sessionError) {
        return next(serviceUnavailable(sessionError.message));
      }

      if (!session) {
        return next(unauthorized("Session is missing, revoked, or for another device."));
      }

      const activeSession = session as SessionRow;

      if ((activeSession.branch_id ?? null) !== (branchId ?? null)) {
        return next(unauthorized("Session branch does not match request context."));
      }

      contextUser.session = {
        session_id: activeSession.id,
        device_id: activeSession.device_id
      };
    }

    req.context = {
      request_id,
      user: contextUser
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
