"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * Hook that powers the "items couldn't be processed" banner on /activity.
 *
 * Behavior contract:
 *   - On mount: calls `count_processing_errors()` (migration 007). The RPC
 *     runs SECURITY INVOKER, so RLS on pipeline_runs scopes the count to
 *     the current athlete.
 *   - `retry()` POSTs to /api/reprocess. The API route is server-side and
 *     uses the service-role client, but it scopes failures by user.id so
 *     the request only touches the calling athlete's items.
 *   - After retry resolves (success or failure), the count is refetched
 *     so the banner disappears once the queue empties — no manual reload
 *     needed.
 *
 * Page-specific by design: the banner is the only consumer of this count
 * today, and the predicate ("what counts as a processing error") may
 * diverge from generic dashboard counts as the pipeline evolves.
 */

export interface UseUnprocessed {
  count: number;
  loading: boolean;
  /** Non-null when the count fetch itself failed. Network errors only. */
  error: string | null;
  /** True while a /api/reprocess request is in flight. */
  retrying: boolean;
  /** Non-null when the most recent retry failed. */
  retryError: string | null;
  retry: () => Promise<void>;
  /** Force a count refetch (used after retry, also exposed for callers). */
  refresh: () => void;
}

export function useUnprocessed(): UseUnprocessed {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data, error: rpcError } = await (
          supabase as unknown as {
            rpc: (
              fn: string,
            ) => Promise<{
              data: number | null;
              error: { message: string } | null;
            }>;
          }
        ).rpc("count_processing_errors");

        if (cancelled) return;

        if (rpcError) {
          // Don't surface this to users by default — the banner just
          // stays hidden. Callers who want to display a section error
          // can read `error` directly.
          setError(rpcError.message);
          setCount(0);
        } else {
          setCount(typeof data === "number" ? data : 0);
        }
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load processing errors",
        );
        setCount(0);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  const retry = useCallback(async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/reprocess", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail =
          body && typeof body === "object" && "error" in body
            ? String((body as { error?: unknown }).error ?? `HTTP ${res.status}`)
            : `HTTP ${res.status}`;
        setRetryError(detail);
      }
    } catch (e) {
      setRetryError(
        e instanceof Error ? e.message : "Retry request failed",
      );
    } finally {
      setRetrying(false);
      // Refetch the count whether the retry succeeded or failed — even a
      // partial batch may have cleared some rows, and a full failure
      // shouldn't leave the count cached as stale.
      refresh();
    }
  }, [refresh]);

  return {
    count,
    loading,
    error,
    retrying,
    retryError,
    retry,
    refresh,
  };
}
