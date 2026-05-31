import type { ApiSession } from "@mst/shared";

const browserSessionKey = "mst.apiSession";
const browserDeviceKey = "mst.deviceId";
const browserTerminalNameKey = "mst.terminalName";

function browserAvailable() {
  return typeof window !== "undefined";
}

function desktopBridge() {
  return browserAvailable() ? window.mstDesktop : undefined;
}

export async function getDeviceId() {
  const bridge = desktopBridge();

  if (bridge?.getDeviceId) {
    return bridge.getDeviceId();
  }

  if (!browserAvailable()) {
    throw new Error("Device id is only available in the browser or Electron.");
  }

  const existing = window.localStorage.getItem(browserDeviceKey);

  if (existing) {
    return existing;
  }

  const nextDeviceId = crypto.randomUUID();
  window.localStorage.setItem(browserDeviceKey, nextDeviceId);
  return nextDeviceId;
}

export async function saveApiSession(session: ApiSession) {
  const bridge = desktopBridge();

  if (bridge?.setSession) {
    await bridge.setSession(session);
    return;
  }

  if (browserAvailable()) {
    window.localStorage.setItem(browserSessionKey, JSON.stringify(session));
  }
}

export async function getTerminalName() {
  const bridge = desktopBridge();

  if (bridge?.getTerminalName) {
    return bridge.getTerminalName();
  }

  if (!browserAvailable()) {
    return null;
  }

  return window.localStorage.getItem(browserTerminalNameKey);
}

export async function saveTerminalName(terminalName: string) {
  const bridge = desktopBridge();

  if (bridge?.setTerminalName) {
    await bridge.setTerminalName(terminalName);
    return;
  }

  if (browserAvailable()) {
    window.localStorage.setItem(browserTerminalNameKey, terminalName);
  }
}

export async function getApiSession() {
  const bridge = desktopBridge();

  if (bridge?.getSession) {
    return bridge.getSession();
  }

  if (!browserAvailable()) {
    return null;
  }

  const rawSession = window.localStorage.getItem(browserSessionKey);

  if (!rawSession) {
    return null;
  }

  return JSON.parse(rawSession) as ApiSession;
}

export async function clearApiSession() {
  const bridge = desktopBridge();

  if (bridge?.clearSession) {
    await bridge.clearSession();
    return;
  }

  if (browserAvailable()) {
    window.localStorage.removeItem(browserSessionKey);
  }
}
