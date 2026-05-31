import { OperationsHealthClient } from "@/features/operations/components/operations-health-client";

export default function OperationsPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Operations</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Operations Health
        </h1>
      </div>
      <OperationsHealthClient />
    </section>
  );
}
