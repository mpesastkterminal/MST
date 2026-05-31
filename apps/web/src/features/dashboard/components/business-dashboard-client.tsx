"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { getApiSession } from "@/lib/auth/session-storage";

type BranchSummary = {
  id: string;
  name: string;
  code: string;
  total_transactions: number;
  successful_transactions: number;
  failed_transactions: number;
  total_value_processed: number;
};

type RecentTransaction = {
  id: string;
  status: string;
  amount: number;
  created_at: string;
  account_reference: string | null;
};

type DashboardResponse = {
  kpis: {
    total_transactions: number;
    successful_transactions: number;
    failed_transactions: number;
    success_rate: number;
    total_value_processed: number;
  };
  branch_summary: BranchSummary[];
  recent_activity: RecentTransaction[];
  branch_ranking: BranchSummary[];
  recent_transactions: RecentTransaction[];
  failure_rate: number;
};

type PreferencesResponse = {
  available_widgets: string[];
  preferences: {
    widgets: string[];
  };
};

const widgetLabels: Record<string, string> = {
  total_transactions: "Total Transactions",
  successful_transactions: "Successful Transactions",
  failed_transactions: "Failed Transactions",
  success_rate: "Success Rate",
  total_processed_amount: "Total Processed Amount",
  branch_comparison: "Branch Comparison",
  branch_ranking: "Branch Ranking",
  recent_transactions: "Recent Transactions",
  failure_rate: "Failure Rate",
  recent_activity: "Recent Activity"
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(value);
}

function widgetValue(widget: string, dashboard: DashboardResponse) {
  switch (widget) {
    case "total_transactions":
      return dashboard.kpis.total_transactions;
    case "successful_transactions":
      return dashboard.kpis.successful_transactions;
    case "failed_transactions":
      return dashboard.kpis.failed_transactions;
    case "success_rate":
      return `${dashboard.kpis.success_rate}%`;
    case "failure_rate":
      return `${dashboard.failure_rate}%`;
    case "total_processed_amount":
      return formatCurrency(dashboard.kpis.total_value_processed);
    default:
      return null;
  }
}

export function BusinessDashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [availableWidgets, setAvailableWidgets] = useState<string[]>([]);
  const [enabledWidgets, setEnabledWidgets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const session = await getApiSession();

        if (!session) {
          return;
        }

        const [dashboardResponse, preferencesResponse] = await Promise.all([
          apiFetch(`/businesses/${session.business_id}/dashboard`),
          apiFetch(`/businesses/${session.business_id}/dashboard/preferences`)
        ]);

        if (!dashboardResponse.ok || !preferencesResponse.ok) {
          throw new Error("Unable to load dashboard.");
        }

        const dashboardPayload =
          (await dashboardResponse.json()) as DashboardResponse;
        const preferencesPayload =
          (await preferencesResponse.json()) as PreferencesResponse;

        if (active) {
          setDashboard(dashboardPayload);
          setAvailableWidgets(preferencesPayload.available_widgets);
          setEnabledWidgets(preferencesPayload.preferences.widgets);
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load dashboard."
          );
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  async function saveWidgets(nextWidgets: string[]) {
    setSaving(true);

    try {
      const session = await getApiSession();

      if (!session) {
        return;
      }

      const response = await apiFetch(
        `/businesses/${session.business_id}/dashboard/preferences`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ widgets: nextWidgets })
        }
      );

      if (!response.ok) {
        throw new Error("Unable to save dashboard preferences.");
      }

      setEnabledWidgets(nextWidgets);
    } finally {
      setSaving(false);
    }
  }

  function toggleWidget(widget: string) {
    const nextWidgets = enabledWidgets.includes(widget)
      ? enabledWidgets.filter((item) => item !== widget)
      : [...enabledWidgets, widget];

    void saveWidgets(nextWidgets);
  }

  function moveWidget(widget: string, direction: -1 | 1) {
    const index = enabledWidgets.indexOf(widget);
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= enabledWidgets.length) {
      return;
    }

    const nextWidgets = [...enabledWidgets];
    nextWidgets.splice(index, 1);
    nextWidgets.splice(nextIndex, 0, widget);
    void saveWidgets(nextWidgets);
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Loading dashboard...
      </div>
    );
  }

  const kpiWidgets = enabledWidgets.filter(
    (widget) => widgetValue(widget, dashboard) !== null
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {kpiWidgets.map((widget) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            key={widget}
          >
            <p className="text-sm font-medium text-slate-500">
              {widgetLabels[widget]}
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">
              {widgetValue(widget, dashboard)}
            </p>
          </article>
        ))}
      </section>

      {enabledWidgets.includes("branch_comparison") ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Branch Comparison
          </h2>
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Success</th>
                  <th className="px-4 py-3 font-medium">Failed</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.branch_summary.map((branch) => (
                  <tr className="border-t border-slate-200" key={branch.id}>
                    <td className="px-4 py-3 text-slate-900">{branch.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {branch.total_transactions}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {branch.successful_transactions}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {branch.failed_transactions}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatCurrency(branch.total_value_processed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {enabledWidgets.includes("branch_ranking") ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Branch Ranking
          </h2>
          <div className="mt-4 space-y-3">
            {dashboard.branch_ranking.map((branch, index) => (
              <div
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                key={branch.id}
              >
                <span className="font-medium text-slate-900">
                  {index + 1}. {branch.name}
                </span>
                <span className="text-slate-600">
                  {formatCurrency(branch.total_value_processed)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {enabledWidgets.includes("recent_activity") ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Recent Activity
          </h2>
          <div className="mt-4 space-y-3">
            {dashboard.recent_activity.map((activity) => (
              <div
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                key={activity.id}
              >
                <span className="font-medium text-slate-900">
                  {activity.account_reference ?? activity.id}
                </span>
                <span className="text-slate-600">{activity.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {enabledWidgets.includes("recent_transactions") ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Recent Transactions
          </h2>
          <div className="mt-4 space-y-3">
            {dashboard.recent_transactions.map((transaction) => (
              <div
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                key={transaction.id}
              >
                <span className="font-medium text-slate-900">
                  {transaction.account_reference ?? transaction.id}
                </span>
                <span className="text-slate-600">{transaction.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Widgets</h2>
          <span className="text-xs text-slate-500">
            {saving ? "Saving..." : "Saved"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {availableWidgets.map((widget) => (
            <div
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
              key={widget}
            >
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={enabledWidgets.includes(widget)}
                  onChange={() => toggleWidget(widget)}
                  type="checkbox"
                />
                {widgetLabels[widget]}
              </label>
              <div className="flex gap-1">
                <button
                  className="rounded border border-slate-200 px-2 text-sm text-slate-600 disabled:opacity-40"
                  disabled={!enabledWidgets.includes(widget)}
                  onClick={() => moveWidget(widget, -1)}
                  type="button"
                >
                  Up
                </button>
                <button
                  className="rounded border border-slate-200 px-2 text-sm text-slate-600 disabled:opacity-40"
                  disabled={!enabledWidgets.includes(widget)}
                  onClick={() => moveWidget(widget, 1)}
                  type="button"
                >
                  Down
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
