"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { getApiSession } from "@/lib/auth/session-storage";

type BranchRow = {
  id: string;
  name: string;
  code: string;
  status: string;
};

export function BranchManagementClient() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function loadBranches(targetBusinessId = businessId) {
    if (!targetBusinessId) {
      return;
    }

    const response = await apiFetch(`/businesses/${targetBusinessId}/branches`);

    if (!response.ok) {
      throw new Error("Unable to load branches.");
    }

    const payload = (await response.json()) as { branches: BranchRow[] };
    setBranches(payload.branches);
  }

  useEffect(() => {
    async function load() {
      const session = await getApiSession();

      if (!session) {
        return;
      }

      setBusinessId(session.business_id);
      await loadBranches(session.business_id);
    }

    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Unable to load branches.")
    );
  }, []);

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId) {
      return;
    }

    const response = await apiFetch(`/businesses/${businessId}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code })
    });

    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload?.error?.message ?? "Unable to create branch.");
      return;
    }

    setName("");
    setCode("");
    setMessage("Branch created.");
    await loadBranches();
  }

  async function postBranchAction(branchId: string, action: string) {
    if (!businessId) {
      return;
    }

    const response = await apiFetch(
      `/businesses/${businessId}/branches/${branchId}/${action}`,
      { method: "POST" }
    );

    if (!response.ok) {
      setMessage("Unable to update branch.");
      return;
    }

    await loadBranches();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Create Branch
        </h2>
        <form className="mt-4 space-y-3" onSubmit={createBranch}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setName(event.target.value)}
            placeholder="Branch name"
            required
            value={name}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code"
            required
            value={code}
          />
          <Button type="submit">Create Branch</Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Manage Branches
        </h2>
        {message ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        ) : null}
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr className="border-t border-slate-200" key={branch.id}>
                  <td className="px-4 py-3 text-slate-900">{branch.name}</td>
                  <td className="px-4 py-3 text-slate-600">{branch.code}</td>
                  <td className="px-4 py-3 text-slate-600">{branch.status}</td>
                  <td className="space-x-2 px-4 py-3">
                    <Link
                      className="text-sm text-slate-700"
                      href={`/branches/${branch.id}`}
                    >
                      View
                    </Link>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void postBranchAction(branch.id, "suspend")}
                      type="button"
                    >
                      Suspend
                    </button>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void postBranchAction(branch.id, "reactivate")}
                      type="button"
                    >
                      Reactivate
                    </button>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void postBranchAction(branch.id, "archive")}
                      type="button"
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
