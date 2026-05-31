export default function AdminAuditLogsPage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-emerald-700">Super Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">Audit Logs</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          Audit logs are append-only and available through the tenant-scoped
          audit endpoints. Platform review is retained server-side for super
          admin operations.
        </p>
      </div>
    </section>
  );
}
