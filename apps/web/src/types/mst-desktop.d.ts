import type { ApiSession } from "@mst/shared";

declare global {
  interface Window {
    mstDesktop?: {
      getDeviceId: () => Promise<string>;
      getSession: () => Promise<ApiSession | null>;
      setSession: (session: ApiSession) => Promise<void>;
      clearSession: () => Promise<void>;
      getTerminalName: () => Promise<string | null>;
      setTerminalName: (terminalName: string) => Promise<void>;
    };
  }
}

export {};
