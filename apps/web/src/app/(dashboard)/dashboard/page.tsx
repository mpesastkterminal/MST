import { Role } from "@mst/shared";

import { HealthStatus } from "@/features/health/components/health-status";
import { KpiGrid } from "@/features/dashboard/components/kpi-grid";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">Business Owner</p>
          <h1 className="text-3xl font-semibold text-slate-950">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Static KPI shell for the {Role.BusinessOwner.replace("_", " ")} role.
          </p>
        </div>
        <HealthStatus />
      </header>

      <KpiGrid />
    </div>
  );
}
