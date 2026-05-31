import type { RequestHandler } from "express";
import { Role, type Permission } from "@mst/shared";

import { forbidden } from "../errors/http-error";

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.context.user.permissions.includes(permission)) {
      return next(forbidden(`Missing permission: ${permission}`));
    }

    return next();
  };
}

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.context.user.roles.includes(role)) {
      return next(forbidden(`Missing role: ${role}`));
    }

    return next();
  };
}

export const enforceBusinessParam: RequestHandler = (req, _res, next) => {
  const businessId = req.params.businessId;

  if (businessId && businessId !== req.context.user.business_id) {
    return next(forbidden("Business route does not match active tenant context."));
  }

  return next();
};

export const enforceBranchParam: RequestHandler = (req, _res, next) => {
  const branchId = req.params.branchId;
  const contextBranchId = req.context.user.branch_id;

  if (!branchId) {
    return next();
  }

  if (contextBranchId && branchId !== contextBranchId) {
    return next(forbidden("Branch route does not match active branch context."));
  }

  return next();
};
