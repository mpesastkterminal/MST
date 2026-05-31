"use client";

import { useEffect, useState } from "react";

type HealthState = "checking" | "online" | "offline";

export function HealthStatus() {
  const [status, setStatus] = useState<HealthState>("checking");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    fetch(`${apiUrl}/health`)
      .then((response) => {
        setStatus(response.ok ? "online" : "offline");
      })
      .catch(() => {
        setStatus("offline");
      });
  }, []);

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
      API:{" "}
      <span className="font-medium text-slate-950">
        {status === "checking" ? "Checking" : status}
      </span>
    </div>
  );
}
