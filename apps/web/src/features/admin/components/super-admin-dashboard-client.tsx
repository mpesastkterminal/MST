"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

type PlatformDashboard = {
  total_businesses: number;
  active_businesses: number;
  suspended_businesses: number;
  total_branches: number;
  total_platform_transactions: number;
  successful_transactions: number;
  failed_transactions: number;
  total_platform_transaction_volume: number;
  recent_activity: Array<{
    id: string;
    action: string;
    entity_type: string;
    created_at: string;
  }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(value);
}

export function SuperAdminDashboardClient() {
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const response = await apiFetch("/platform/dashboard");

        if (!response.ok) {
          throw new Error("Unable to load super admin dashboard.");
        }

        const payload = (await response.json()) as PlatformDashboard;

        if (active) {
          setDashboard(payload);
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load super admin dashboard."
          );
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

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
        Loading platform dashboard...
      </div>
    );
  }

  const cards = [
    ["Total Businesses", dashboard.total_businesses],
    ["Active Businesses", dashboard.active_businesses],
    ["Suspended Businesses", dashboard.suspended_businesses],
    ["Total Branches", dashboard.total_branches],
    ["Platform Transactions", dashboard.total_platform_transactions],
    ["Successful Transactions", dashboard.successful_transactions],
    ["Failed Transactions", dashboard.failed_transactions],
    ["Platform Volume", formatCurrency(dashboard.total_platform_transaction_volume)]
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">
              {value}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Recent Activity
        </h2>
        <div className="mt-4 space-y-3">
          {dashboard.recent_activity.map((item) => (
            <div
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
              key={item.id}
            >
              <span className="font-medium text-slate-900">{item.action}</span>
              <span className="text-slate-600">{item.entity_type}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
