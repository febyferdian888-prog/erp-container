"use client";

import { useEffect, useState } from "react";
import type { Permissions } from "@/lib/rbac-shared";

export interface Me {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  perms: Permissions;
}

let cached: Promise<Me | null> | null = null;

export function usePermissions() {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!cached) {
      cached = fetch("/api/me")
        .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
        .catch(() => null);
    }
    let alive = true;
    cached.then((m) => {
      if (!alive) return;
      if (!m) cached = null; // retry on the next mount, e.g. after signing in
      setMe(m);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { me, loaded };
}

export function resetPermissionsCache() {
  cached = null;
}
