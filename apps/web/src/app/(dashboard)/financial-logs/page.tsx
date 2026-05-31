export default function FinancialLogsPage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-emerald-700">Business Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Financial Logs
        </h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          Transaction history, status summaries, and branch summaries are served
          by the reporting endpoints added in the operations layer.
        </p>
      </div>
    </section>
  );
}
