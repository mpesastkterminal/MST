import { Role, type UserContext } from "@mst/shared";

export function hasRole(context: UserContext, role: Role) {
  return context.roles.includes(role);
}

export function isSuperAdmin(context: UserContext) {
  return hasRole(context, Role.SuperAdmin);
}

export function isBusinessOwner(context: UserContext) {
  return hasRole(context, Role.BusinessOwner);
}

export function isBranchManager(context: UserContext) {
  return hasRole(context, Role.BranchManager);
}

export function isCashier(context: UserContext) {
  return hasRole(context, Role.Cashier);
}
