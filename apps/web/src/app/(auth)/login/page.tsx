"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiSessionError, createApiSession } from "@/lib/api/client";
import {
  getTerminalName,
  saveApiSession,
  saveTerminalName
} from "@/lib/auth/session-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PendingAuthSession = {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [pendingAuthSession, setPendingAuthSession] =
    useState<PendingAuthSession | null>(null);
  const [terminalRequired, setTerminalRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!terminalRequired) {
      return;
    }

    void getTerminalName().then((storedName) => {
      if (storedName) {
        setTerminalName(storedName);
      }
    });
  }, [terminalRequired]);

  async function finishSession(authSession: PendingAuthSession, terminal?: string) {
    const { session } = await createApiSession({
      access_token: authSession.access_token,
      refresh_token: authSession.refresh_token,
      expires_at: authSession.expires_at,
      terminal_name: terminal?.trim() || null
    });

    if (terminal?.trim()) {
      await saveTerminalName(terminal.trim());
    }

    await saveApiSession(session);
    router.replace("/dashboard");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (terminalRequired && pendingAuthSession) {
        await finishSession(pendingAuthSession, terminalName);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError || !data.session) {
        throw new Error(loginError?.message ?? "Unable to sign in.");
      }

      const authSession: PendingAuthSession = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null
      };

      try {
        await finishSession(authSession);
      } catch (sessionError) {
        if (
          sessionError instanceof ApiSessionError &&
          sessionError.code === "terminal_required"
        ) {
          setPendingAuthSession(authSession);
          setTerminalRequired(true);
          return;
        }

        throw sessionError;
      }
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
            {terminalRequired ? "Name this terminal" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {terminalRequired
              ? "Cashier sessions are tied to a specific terminal."
              : "Use your provisioned business account to continue."}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {!terminalRequired ? (
            <>
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
                <span className="text-sm font-medium text-slate-700">
                  Password
                </span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  required
                  type="password"
                  value={password}
                />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Terminal Name
              </span>
              <input
                autoFocus
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                onChange={(event) => setTerminalName(event.target.value)}
                placeholder="Counter 1"
                required
                type="text"
                value={terminalName}
              />
            </label>
          )}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={loading} type="submit">
            {loading
              ? "Continuing..."
              : terminalRequired
                ? "Start cashier session"
                : "Continue"}
          </Button>
        </form>
      </section>
    </main>
  );
}
