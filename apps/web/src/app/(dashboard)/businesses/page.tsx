export default function BusinessesPage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-emerald-700">Tenants</p>
        <h1 className="text-3xl font-semibold text-slate-950">Businesses</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          Business management placeholder. Tenant records will be scoped by
          business_id in the backend.
        </p>
      </div>
    </section>
  );
}
