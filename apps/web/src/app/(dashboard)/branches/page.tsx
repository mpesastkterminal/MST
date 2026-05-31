const branches = [
  { name: "Main Branch", code: "MAIN", status: "Active" },
  { name: "Westlands", code: "WST", status: "Active" }
];

export default function BranchesPage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-emerald-700">Operations</p>
        <h1 className="text-3xl font-semibold text-slate-950">Branches</h1>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr className="border-t border-slate-200" key={branch.code}>
                <td className="px-4 py-3 text-slate-900">{branch.name}</td>
                <td className="px-4 py-3 text-slate-600">{branch.code}</td>
                <td className="px-4 py-3 text-slate-600">{branch.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
