"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { getApiSession } from "@/lib/auth/session-storage";

type HealthPayload = {
  health: {
    failed_stk_count: number;
    pending_stk_count: number;
    callback_failures: number;
    credential_issues: Array<{ branch_id: string; issue: string }>;
    inactive_branches: Array<{ id: string; name: string; status: string }>;
    failure_rate: number;
    warnings: Array<{ code: string; severity: string; message: string }>;
  };
};

export function OperationsHealthClient() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHealth() {
      try {
        const session = await getApiSession();

        if (!session) {
          return;
        }

        const response = await apiFetch(
          `/businesses/${session.business_id}/operations/health`
        );

        if (!response.ok) {
          throw new Error("Unable to load operations health.");
        }

        const data = (await response.json()) as HealthPayload;

        if (active) {
          setPayload(data);
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load operations health."
          );
        }
      }
    }

    void loadHealth();

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

  if (!payload) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Loading operations health...
      </div>
    );
  }

  const cards = [
    ["Failed STK", payload.health.failed_stk_count],
    ["Pending STK", payload.health.pending_stk_count],
    ["Callback Failures", payload.health.callback_failures],
    ["Credential Issues", payload.health.credential_issues.length],
    ["Inactive Branches", payload.health.inactive_branches.length],
    ["Failure Rate", `${payload.health.failure_rate}%`]
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
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
        <h2 className="text-lg font-semibold text-slate-950">Warnings</h2>
        <div className="mt-4 space-y-3">
          {payload.health.warnings.length === 0 ? (
            <p className="text-sm text-slate-600">No operational warnings.</p>
          ) : (
            payload.health.warnings.map((warning) => (
              <div
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                key={`${warning.code}-${warning.message}`}
              >
                <p className="font-medium text-slate-900">{warning.message}</p>
                <p className="text-xs uppercase text-slate-500">
                  {warning.severity}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
