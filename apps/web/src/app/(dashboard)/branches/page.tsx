import { BranchManagementClient } from "@/features/branches/components/branch-management-client";

export default function BranchesPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Business Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Branch Management
        </h1>
      </div>
      <BranchManagementClient />
    </section>
  );
}
