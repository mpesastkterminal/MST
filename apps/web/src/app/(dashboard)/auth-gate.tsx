"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getApiSession } from "@/lib/auth/session-storage";

export function AuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getApiSession()
      .then((session) => {
        if (!session) {
          router.replace("/login");
          return;
        }

        setReady(true);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  if (!ready) {
    return null;
  }

  return children;
}
