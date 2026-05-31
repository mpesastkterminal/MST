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
  AuditRead = "audit:read"
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
    Permission.AuditRead
  ],
  [Role.BranchManager]: [
    Permission.StkPushCreate,
    Permission.TransactionsRead,
    Permission.BranchesRead,
    Permission.UsersRead,
    Permission.AuditRead
  ],
  [Role.Cashier]: [
    Permission.StkPushCreate,
    Permission.TransactionsRead
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
  status: "active" | "suspended";
  created_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  name: string;
  code: string;
  status: "active" | "inactive";
  created_at: string;
}

export interface ApiSession {
  session_id: string;
  user_id: string;
  business_id: string;
  branch_id: string | null;
  device_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
}
