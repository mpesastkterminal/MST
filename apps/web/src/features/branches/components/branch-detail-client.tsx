"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { getApiSession } from "@/lib/auth/session-storage";

type BranchDetail = {
  branch: { name: string; code: string; status: string };
  credential_status: { active_credentials: number; credentials: unknown[] };
  transaction_summary: {
    total_transactions: number;
    successful_transactions: number;
    failed_transactions: number;
  };
  assigned_users: unknown[];
  assigned_devices: unknown[];
};

export function BranchDetailClient({ branchId }: { branchId: string }) {
  const [detail, setDetail] = useState<BranchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDetail() {
      const session = await getApiSession();

      if (!session) {
        return;
      }

      const response = await apiFetch(
        `/businesses/${session.business_id}/branches/${branchId}`
      );

      if (!response.ok) {
        throw new Error("Unable to load branch detail.");
      }

      setDetail((await response.json()) as BranchDetail);
    }

    void loadDetail().catch((caughtError) =>
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load branch detail."
      )
    );
  }, [branchId]);

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
        Loading branch...
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        ["Status", detail.branch.status],
        ["Active Credentials", detail.credential_status.active_credentials],
        ["Transactions", detail.transaction_summary.total_transactions],
        ["Failed Transactions", detail.transaction_summary.failed_transactions],
        ["Assigned Users", detail.assigned_users.length],
        ["Assigned Devices", detail.assigned_devices.length]
      ].map(([label, value]) => (
        <article
          className="rounded-lg border border-slate-200 bg-white p-5"
          key={label}
        >
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </article>
      ))}
    </div>
  );
}
