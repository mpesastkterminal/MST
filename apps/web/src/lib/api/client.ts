import type { ApiSession } from "@mst/shared";

import {
  getApiSession,
  getDeviceId,
  saveApiSession
} from "@/lib/auth/session-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface CreateApiSessionInput {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  business_id?: string;
  branch_id?: string;
  terminal_name?: string | null;
}

export async function createApiSession(input: CreateApiSessionInput) {
  const deviceId = await getDeviceId();
  const headers = new Headers({
    Authorization: `Bearer ${input.access_token}`,
    "Content-Type": "application/json",
    "x-mst-device-id": deviceId
  });

  if (input.business_id) {
    headers.set("x-mst-business-id", input.business_id);
  }

  if (input.branch_id) {
    headers.set("x-mst-branch-id", input.branch_id);
  }

  const response = await fetch(`${apiUrl}/auth/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      expires_at: input.expires_at,
      terminal_name: input.terminal_name ?? null
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Failed to create API session.");
  }

  const session: ApiSession = {
    ...payload.session,
    access_token: input.access_token,
    refresh_token: input.refresh_token,
    expires_at: input.expires_at
  };

  return {
    session,
    context: payload.context
  };
}

async function ensureFreshAccessToken(session: ApiSession) {
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;

  if (!expiresAtMs || expiresAtMs > Date.now() + 60_000) {
    return session;
  }

  if (!session.refresh_token) {
    return session;
  }

  const { data, error } = await getSupabaseBrowserClient().auth.refreshSession({
    refresh_token: session.refresh_token
  });

  if (error || !data.session) {
    return session;
  }

  const refreshedSession: ApiSession = {
    ...session,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token ?? session.refresh_token,
    expires_at: data.session.expires_at ?? session.expires_at
  };

  await saveApiSession(refreshedSession);
  return refreshedSession;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const storedSession = await getApiSession();

  if (!storedSession) {
    throw new Error("No active MST API session.");
  }

  const session = await ensureFreshAccessToken(storedSession);
  const deviceId = await getDeviceId();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  headers.set("x-mst-session-id", session.session_id);
  headers.set("x-mst-device-id", deviceId);
  headers.set("x-mst-business-id", session.business_id);

  if (session.branch_id) {
    headers.set("x-mst-branch-id", session.branch_id);
  }

  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers
  });
}
