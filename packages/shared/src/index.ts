export enum Role {
  SuperAdmin = "super_admin",
  BusinessOwner = "business_owner",
  BranchManager = "branch_manager",
  Cashier = "cashier"
}

export enum Permission {
  StkPushCreate = "stk_push:create",
  TransactionsRead = "transactions:read",
  BranchesRead = "branches:read",
  BranchesManage = "branches:manage",
  UsersRead = "users:read",
  UsersManage = "users:manage",
  AuditRead = "audit:read",
  DashboardRead = "dashboard:read",
  ReportsRead = "reports:read",
  CredentialsManage = "credentials:manage",
  SessionsManage = "sessions:manage",
  OperationsRead = "operations:read",
  BusinessesManage = "businesses:manage"
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SuperAdmin]: Object.values(Permission),
  [Role.BusinessOwner]: [
    Permission.StkPushCreate,
    Permission.TransactionsRead,
    Permission.BranchesRead,
    Permission.BranchesManage,
    Permission.UsersRead,
    Permission.UsersManage,
    Permission.AuditRead,
    Permission.DashboardRead,
    Permission.ReportsRead,
    Permission.CredentialsManage,
    Permission.SessionsManage,
    Permission.OperationsRead
  ],
  [Role.BranchManager]: [
    Permission.StkPushCreate,
    Permission.TransactionsRead,
    Permission.BranchesRead,
    Permission.UsersRead,
    Permission.AuditRead,
    Permission.DashboardRead,
    Permission.ReportsRead,
    Permission.OperationsRead
  ],
  [Role.Cashier]: [
    Permission.StkPushCreate,
    Permission.TransactionsRead,
    Permission.DashboardRead,
    Permission.ReportsRead
  ]
};

export interface RoleAssignment {
  business_id: string;
  branch_id: string | null;
  role: Role;
}

export interface SessionContext {
  session_id: string;
  device_id: string;
  terminal_id: string | null;
}

export interface UserContext {
  user_id: string;
  business_id: string;
  branch_id: string | null;
  roles: Role[];
  permissions: Permission[];
  role_assignments: RoleAssignment[];
  session: SessionContext | null;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  created_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  name: string;
  code: string;
  status: BranchStatus;
  created_at: string;
}

export interface ApiSession {
  session_id: string;
  user_id: string;
  business_id: string;
  branch_id: string | null;
  device_id: string;
  terminal_id: string | null;
  terminal_name: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
}

export type BusinessStatus = "active" | "suspended" | "archived";
export type BranchStatus = "active" | "suspended" | "archived";
export type UserStatus = "invited" | "active" | "suspended" | "disabled";
export type TerminalStatus = "active" | "revoked";

export type TransactionStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "reversed";
