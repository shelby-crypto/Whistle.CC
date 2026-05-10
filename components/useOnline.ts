"use client";

import { useEffect, useState } from "react";

/**
 * Tiny hook that mirrors `navigator.onLine`. Returns `true` when the
 * browser believes it has a network connection.
 *
 * Caveats worth knowing:
 *   - `navigator.onLine` is best-effort. A captive-portal "connected"
 *     network reports online even when DNS / Supabase is unreachable.
 *     For that reason the rest of the app shouldn't *only* trust this
 *     hook — section-level errors still appear when a query actually
 *     fails. The offline banner is a hint, not a hard gate.
 *   - SSR returns `true` (the conservative default) — the banner shouldn't
 *     flash on the first server-rendered paint.
 *
 * No throttling: the `online` and `offline` events fire at most once
 * per state change, so the listener is cheap.
 */
export function useOnline(): boolean {
  // SSR-safe initial value. If `navigator` is missing we assume online —
  // the alternative ("offline by default until proven otherwise") would
  // flash the banner on every first render.
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Ensure the state is correct on mount — SSR couldn't read
    // navigator.onLine, and the first useState run on the client may
    // happen during hydration before the events fire.
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
