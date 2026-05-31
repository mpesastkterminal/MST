"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createApiSession } from "@/lib/api/client";
import {
  getTerminalName,
  saveApiSession,
  saveTerminalName
} from "@/lib/auth/session-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getTerminalName().then((storedName) => {
      if (storedName) {
        setTerminalName(storedName);
      }
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError || !data.session) {
        throw new Error(loginError?.message ?? "Unable to sign in.");
      }

      const { session } = await createApiSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
        terminal_name: terminalName.trim() || null
      });

      if (terminalName.trim()) {
        await saveTerminalName(terminalName.trim());
      }

      await saveApiSession(session);
      router.replace("/dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to sign in."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            MST
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            Sign in to your terminal
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Use your business account to start a secure device session.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              type="password"
              value={password}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Terminal Name
            </span>
            <input
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              onChange={(event) => setTerminalName(event.target.value)}
              placeholder="Counter 1"
              type="text"
              value={terminalName}
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Continue to dashboard"}
          </Button>
        </form>
      </section>
    </main>
  );
}
