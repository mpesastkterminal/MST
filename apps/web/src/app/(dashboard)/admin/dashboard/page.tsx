import { SuperAdminDashboardClient } from "@/features/admin/components/super-admin-dashboard-client";

export default function SuperAdminDashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Super Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Platform Dashboard
        </h1>
      </div>
      <SuperAdminDashboardClient />
    </section>
  );
}
