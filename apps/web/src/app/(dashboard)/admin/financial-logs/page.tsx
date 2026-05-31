export default function AdminFinancialLogsPage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-emerald-700">Super Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Financial Logs
        </h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          Platform financial log review uses the secured transaction and
          reporting APIs with super admin visibility.
        </p>
      </div>
    </section>
  );
}
