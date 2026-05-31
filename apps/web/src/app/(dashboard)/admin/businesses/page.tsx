import { BusinessManagementClient } from "@/features/admin/components/business-management-client";

export default function AdminBusinessesPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Super Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">Businesses</h1>
      </div>
      <BusinessManagementClient />
    </section>
  );
}
