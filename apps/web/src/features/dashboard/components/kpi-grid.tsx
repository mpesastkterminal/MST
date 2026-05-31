const kpis = [
  { label: "Today", value: "KES 0", detail: "No live data connected" },
  { label: "Pending STK", value: "0", detail: "M-Pesa flow is future phase" },
  { label: "Branches", value: "2", detail: "Static placeholder data" }
];

export function KpiGrid() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {kpis.map((kpi) => (
        <article
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          key={kpi.label}
        >
          <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {kpi.value}
          </p>
          <p className="mt-2 text-sm text-slate-600">{kpi.detail}</p>
        </article>
      ))}
    </section>
  );
}
