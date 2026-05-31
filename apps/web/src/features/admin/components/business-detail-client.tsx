"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";

type BusinessDetail = {
  business: { name: string; slug: string; status: string };
  owner_accounts: unknown[];
  branches: unknown[];
  credential_status: { active_credentials: number; total_credentials: number };
  transaction_summary: {
    total_transactions: number;
    successful_transactions: number;
    failed_transactions: number;
    total_value_processed: number;
  };
  audit_summary: Array<{ id: string; action: string; entity_type: string }>;
};

export function BusinessDetailClient({ businessId }: { businessId: string }) {
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      const response = await apiFetch(`/businesses/${businessId}`);

      if (!response.ok) {
        throw new Error("Unable to load business detail.");
      }

      const payload = (await response.json()) as BusinessDetail;

      if (active) {
        setDetail(payload);
      }
    }

    void loadDetail().catch((caughtError) =>
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load business detail."
      )
    );

    return () => {
      active = false;
    };
  }, [businessId]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Loading business...
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        ["Status", detail.business.status],
        ["Owners", detail.owner_accounts.length],
        ["Branches", detail.branches.length],
        ["Active Credentials", detail.credential_status.active_credentials],
        ["Transactions", detail.transaction_summary.total_transactions],
        ["Failed Transactions", detail.transaction_summary.failed_transactions]
      ].map(([label, value]) => (
        <article
          className="rounded-lg border border-slate-200 bg-white p-5"
          key={label}
        >
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </article>
      ))}
      <section className="rounded-lg border border-slate-200 bg-white p-5 md:col-span-2">
        <h2 className="text-lg font-semibold text-slate-950">Audit Summary</h2>
        <div className="mt-4 space-y-2">
          {detail.audit_summary.map((item) => (
            <div
              className="flex justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
              key={item.id}
            >
              <span>{item.action}</span>
              <span className="text-slate-500">{item.entity_type}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
