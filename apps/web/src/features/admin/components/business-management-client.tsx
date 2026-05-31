"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
};

export function BusinessManagementClient() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function loadBusinesses() {
    const params = new URLSearchParams();

    if (search.trim()) {
      params.set("search", search.trim());
    }

    if (status !== "all") {
      params.set("status", status);
    }

    const response = await apiFetch(`/businesses?${params.toString()}`);

    if (!response.ok) {
      throw new Error("Unable to load businesses.");
    }

    const payload = (await response.json()) as { businesses: BusinessRow[] };
    setBusinesses(payload.businesses);
  }

  useEffect(() => {
    void loadBusinesses().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Unable to load businesses.")
    );
  }, []);

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const response = await apiFetch("/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug: slug || undefined,
        owner_email: ownerEmail,
        owner_full_name: ownerName,
        temporary_password: temporaryPassword
      })
    });

    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload?.error?.message ?? "Unable to create business.");
      return;
    }

    setName("");
    setSlug("");
    setOwnerEmail("");
    setOwnerName("");
    setTemporaryPassword("");
    setMessage("Business created.");
    await loadBusinesses();
  }

  async function setBusinessStatus(businessId: string, action: string) {
    const response = await apiFetch(`/businesses/${businessId}/${action}`, {
      method: "POST"
    });

    if (!response.ok) {
      setMessage("Unable to update business.");
      return;
    }

    await loadBusinesses();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Create Business
        </h2>
        <form className="mt-4 space-y-3" onSubmit={createBusiness}>
          {[
            ["Business Name", name, setName],
            ["Slug", slug, setSlug],
            ["Owner Email", ownerEmail, setOwnerEmail],
            ["Owner Full Name", ownerName, setOwnerName],
            ["Temporary Password", temporaryPassword, setTemporaryPassword]
          ].map(([label, value, setter]) => (
            <label className="block" key={String(label)}>
              <span className="text-sm font-medium text-slate-700">
                {String(label)}
              </span>
              <input
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) =>
                  (setter as (next: string) => void)(event.target.value)
                }
                required={label !== "Slug"}
                type={label === "Temporary Password" ? "password" : "text"}
                value={String(value)}
              />
            </label>
          ))}
          <Button type="submit">Create</Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2 className="text-lg font-semibold text-slate-950">
            Business List
          </h2>
          <div className="flex gap-2">
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              value={search}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
            <Button onClick={() => void loadBusinesses()} type="button">
              Filter
            </Button>
          </div>
        </div>

        {message ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr className="border-t border-slate-200" key={business.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{business.name}</p>
                    <p className="text-xs text-slate-500">{business.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {business.status}
                  </td>
                  <td className="space-x-2 px-4 py-3">
                    <Link
                      className="text-sm text-slate-700"
                      href={`/admin/businesses/${business.id}`}
                    >
                      View
                    </Link>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void setBusinessStatus(business.id, "suspend")}
                      type="button"
                    >
                      Suspend
                    </button>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void setBusinessStatus(business.id, "reactivate")}
                      type="button"
                    >
                      Reactivate
                    </button>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void setBusinessStatus(business.id, "archive")}
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
