"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type {
  ChartPoint,
  DashboardStatus,
  PlatformRow,
  RecentActivityCounts,
  ScannedSummary,
  WaitingCounts,
} from "@/lib/mockDashboardData";

/**
 * Hook that owns the /dashboard dataset.
 *
 * One round trip per load: invokes the `dashboard_summary` RPC defined in
 * migration 006 which returns a single JSONB document with every section's
 * data. Doing it as one call keeps the dashboard within the 1-second
 * acceptance bound — even on a cold connection most of the budget is
 * round-trip latency, so two queries is twice as slow as one.
 *
 * Caching:
 *   - The latest result is held in a module-scoped cache for 30 seconds.
 *     Tab focus / route returns hit the cache; pull-to-refresh forces a
 *     fresh round trip.
 *   - Cache is keyed by `auth user id`; a logout/login flush is intentional
 *     (the new user's data must never read another athlete's cached doc).
 *
 * Page-specific on purpose: the RPC's JSON shape is wider than any single
 * UI section uses, and multiple components consume different slices —
 * exposing them through one typed `data` object keeps the dashboard
 * page-shape and the SQL function paired in one place.
 */

const CACHE_TTL_MS = 30_000;

export interface DashboardData {
  status: DashboardStatus;
  waiting: WaitingCounts;
  recentActivity: RecentActivityCounts;
  scanned: ScannedSummary;
  chartSeries: ChartPoint[];
  platforms: PlatformRow[];
}

export interface UseDashboard {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  /** Bypass the 30s cache and refetch immediately. */
  refresh: () => void;
}

interface CacheEntry {
  fetchedAt: number;
  authUserId: string;
  data: DashboardData;
}

// Module-scoped cache. Survives navigation between routes within the same
// tab session but is dropped on full reload — exactly what we want for the
// "auto-refresh on tab focus uses cache" behavior in the acceptance spec.
let cache: CacheEntry | null = null;

/**
 * Shape of the `dashboard_summary` RPC payload. Mirrors the SQL in 006.
 */
interface RpcPayload {
  unauthenticated?: boolean;
  status?: {
    accountsMonitored: number;
    platformsLabel: string;
    lastScanMinutesAgo: number | null;
    window: { label: string; endsInHours: number } | null;
  };
  waiting?: { critical: number; calibrate: number };
  recentActivity?: RecentActivityCounts;
  scanned?: { totalPostsScanned: number };
  chartSeries?: ChartPoint[];
  platforms?: PlatformRow[];
}

/**
 * Map the raw RPC payload onto the typed Dashboard shape the page renders.
 * Defaults handle the brand-new-account case (no scans, no rows yet) so the
 * UI doesn't have to special-case "first-load empty".
 */
function payloadToData(payload: RpcPayload): DashboardData {
  return {
    status: {
      accountsMonitored: payload.status?.accountsMonitored ?? 0,
      platformsLabel: payload.status?.platformsLabel ?? "",
      // The mock type is `number` (non-null), but we want to preserve the
      // "never scanned" case as 0 minutes ago vs. some sentinel. Real data
      // post-first-scan is always non-null; map null → 0 for type cleanliness.
      lastScanMinutesAgo: payload.status?.lastScanMinutesAgo ?? 0,
      window: payload.status?.window ?? null,
    },
    waiting: {
      critical: payload.waiting?.critical ?? 0,
      calibrate: payload.waiting?.calibrate ?? 0,
    },
    recentActivity: {
      critical: payload.recentActivity?.critical ?? { last7Days: 0, allTime: 0 },
      removed: payload.recentActivity?.removed ?? { last7Days: 0, allTime: 0 },
      calibrate: payload.recentActivity?.calibrate ?? { last7Days: 0, allTime: 0 },
    },
    scanned: {
      totalPostsScanned: payload.scanned?.totalPostsScanned ?? 0,
    },
    chartSeries: payload.chartSeries ?? [],
    platforms: payload.platforms ?? [],
  };
}

export function useDashboard(): UseDashboard {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Forced-refresh counter; bump it to bypass the 30s cache.
  const [refreshCounter, setRefreshCounter] = useState(0);
  // Identifies the most recent in-flight fetch so a slow earlier response
  // can't overwrite a faster newer one (out-of-order resolution).
  const inflightRef = useRef(0);

  useEffect(() => {
    const requestId = ++inflightRef.current;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const supabase = getSupabaseBrowser();

        // Resolve the auth user once per fetch so the cache key is correct
        // even if the session was just refreshed.
        const authResp = await (
          supabase as unknown as {
            auth: {
              getUser: () => Promise<{
                data: { user: { id: string } | null };
              }>;
            };
          }
        ).auth.getUser();
        const authUserId = authResp.data.user?.id ?? null;

        // Cache hit (only when not a forced refresh).
        const isForced = refreshCounter > 0;
        if (
          !isForced &&
          cache &&
          authUserId &&
          cache.authUserId === authUserId &&
          Date.now() - cache.fetchedAt < CACHE_TTL_MS
        ) {
          if (!cancelled && requestId === inflightRef.current) {
            setData(cache.data);
            setLoading(false);
          }
          return;
        }

        setLoading(true);
        const { data: rpcData, error: rpcError } = await (
          supabase as unknown as {
            rpc: (
              fn: string,
            ) => Promise<{
              data: RpcPayload | null;
              error: { message: string } | null;
            }>;
          }
        ).rpc("dashboard_summary");

        if (cancelled || requestId !== inflightRef.current) return;

        if (rpcError) {
          setError(rpcError.message);
          setLoading(false);
          return;
        }

        const payload = (rpcData ?? {}) as RpcPayload;

        // Unauthenticated callers get a sentinel payload — render zeros
        // rather than throwing.
        const next = payloadToData(payload);
        setData(next);
        setLoading(false);

        if (authUserId) {
          cache = {
            fetchedAt: Date.now(),
            authUserId,
            data: next,
          };
        }
      } catch (e) {
        if (cancelled || requestId !== inflightRef.current) return;
        setError(
          e instanceof Error ? e.message : "Failed to load dashboard data",
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshCounter]);

  const refresh = useCallback(() => {
    // Force-refresh: invalidate the cache and bump the counter so the
    // effect re-runs even if nothing else changed.
    cache = null;
    setRefreshCounter((n) => n + 1);
  }, []);

  return { data, loading, error, refresh };
}
