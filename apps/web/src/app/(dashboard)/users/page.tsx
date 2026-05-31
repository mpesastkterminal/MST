import { UserManagementClient } from "@/features/users/components/user-management-client";

export default function UsersPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Business Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">Users</h1>
      </div>
      <UserManagementClient />
    </section>
  );
}
