const transactions = [
  { id: "STK-001", branch: "Main Branch", amount: "KES 1,250", status: "Pending" },
  { id: "STK-002", branch: "Westlands", amount: "KES 3,400", status: "Success" }
];

export default function TransactionsPage() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-emerald-700">STK Push</p>
        <h1 className="text-3xl font-semibold text-slate-950">Transactions</h1>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Branch</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr className="border-t border-slate-200" key={transaction.id}>
                <td className="px-4 py-3 text-slate-900">{transaction.id}</td>
                <td className="px-4 py-3 text-slate-600">{transaction.branch}</td>
                <td className="px-4 py-3 text-slate-600">{transaction.amount}</td>
                <td className="px-4 py-3 text-slate-600">{transaction.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
