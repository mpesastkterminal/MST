"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { getApiSession } from "@/lib/auth/session-storage";

type UserRow = {
  id: string;
  user_id: string;
  branch_id: string | null;
  role_key: string;
  status: string;
  app_users?: {
    email: string;
    full_name: string;
    status: string;
    last_login_at: string | null;
  };
};

export function UserManagementClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("cashier");
  const [branchId, setBranchId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function loadUsers(targetBusinessId = businessId) {
    if (!targetBusinessId) {
      return;
    }

    const response = await apiFetch(`/businesses/${targetBusinessId}/users`);

    if (!response.ok) {
      throw new Error("Unable to load users.");
    }

    const payload = (await response.json()) as { users: UserRow[] };
    setUsers(payload.users);
  }

  useEffect(() => {
    async function load() {
      const session = await getApiSession();

      if (!session) {
        return;
      }

      setBusinessId(session.business_id);
      await loadUsers(session.business_id);
    }

    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Unable to load users.")
    );
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId) {
      return;
    }

    const response = await apiFetch(`/businesses/${businessId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName,
        role_key: role,
        branch_id: branchId || undefined,
        temporary_password: temporaryPassword
      })
    });

    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload?.error?.message ?? "Unable to create user.");
      return;
    }

    setEmail("");
    setFullName("");
    setBranchId("");
    setTemporaryPassword("");
    setMessage("User created.");
    await loadUsers();
  }

  async function postUserAction(userId: string, action: string) {
    if (!businessId) {
      return;
    }

    const response = await apiFetch(
      `/businesses/${businessId}/users/${userId}/${action}`,
      { method: "POST" }
    );

    if (!response.ok) {
      setMessage("Unable to update user.");
      return;
    }

    await loadUsers();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Create User</h2>
        <form className="mt-4 space-y-3" onSubmit={createUser}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
            type="email"
            value={email}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Full name"
            required
            value={fullName}
          />
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setRole(event.target.value)}
            value={role}
          >
            <option value="branch_manager">Branch Manager</option>
            <option value="cashier">Cashier</option>
          </select>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setBranchId(event.target.value)}
            placeholder="Branch ID"
            required
            value={branchId}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setTemporaryPassword(event.target.value)}
            placeholder="Temporary password"
            required
            type="password"
            value={temporaryPassword}
          />
          <Button type="submit">Create User</Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Users</h2>
        {message ? (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        ) : null}
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-t border-slate-200" key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {user.app_users?.full_name ?? user.user_id}
                    </p>
                    <p className="text-xs text-slate-500">
                      {user.app_users?.email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.role_key}</td>
                  <td className="px-4 py-3 text-slate-600">{user.status}</td>
                  <td className="space-x-2 px-4 py-3">
                    <Link
                      className="text-sm text-slate-700"
                      href={`/users/${user.user_id}`}
                    >
                      View
                    </Link>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void postUserAction(user.user_id, "disable")}
                      type="button"
                    >
                      Disable
                    </button>
                    <button
                      className="text-sm text-slate-700"
                      onClick={() => void postUserAction(user.user_id, "reactivate")}
                      type="button"
                    >
                      Reactivate
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
