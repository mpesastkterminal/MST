"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { getApiSession } from "@/lib/auth/session-storage";

type UserDetail = {
  user: {
    role_key: string;
    branch_id: string | null;
    app_users?: {
      email: string;
      full_name: string;
      status: string;
      last_login_at: string | null;
      last_activity_at: string | null;
    };
  };
  active_sessions: unknown[];
  sessions: unknown[];
  device_count: number;
  active_devices: string[];
};

export function UserDetailClient({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDetail() {
      const session = await getApiSession();

      if (!session) {
        return;
      }

      const response = await apiFetch(
        `/businesses/${session.business_id}/users/${userId}`
      );

      if (!response.ok) {
        throw new Error("Unable to load user detail.");
      }

      setDetail((await response.json()) as UserDetail);
    }

    void loadDetail().catch((caughtError) =>
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load user detail."
      )
    );
  }, [userId]);

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
        Loading user...
      </div>
    );
  }

  const profile = detail.user.app_users;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        ["Name", profile?.full_name ?? userId],
        ["Email", profile?.email ?? ""],
        ["Status", profile?.status ?? ""],
        ["Role", detail.user.role_key],
        ["Branch", detail.user.branch_id ?? "Business-wide"],
        ["Active Sessions", detail.active_sessions.length],
        ["Device Count", detail.device_count],
        ["Last Login", profile?.last_login_at ?? "Never"]
      ].map(([label, value]) => (
        <article
          className="rounded-lg border border-slate-200 bg-white p-5"
          key={label}
        >
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
        </article>
      ))}
    </div>
  );
}
