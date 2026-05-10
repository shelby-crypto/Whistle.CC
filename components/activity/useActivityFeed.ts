"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { ActivityItem, Tier, Platform } from "./types";

/**
 * Hook that owns the /activity feed dataset.
 *
 * Behavior contract:
 *   - One Supabase query per page load: top 50 rows from `activity_items`
 *     ordered by `created_at` DESC, scoped to the current athlete via RLS.
 *   - The view computes `is_repeat` server-side (same author within 30 days).
 *   - Tier filtering is *not* done here — the page reads the URL `?tier=`
 *     param and filters the cached list client-side, which keeps tab
 *     switches instant (the acceptance bound is "instant, no fetch").
 *
 * Page-specific by design — a generic `useSupabase()` would force every
 * caller to learn the activity_items shape and tier mapping; pinning the
 * mapping here means the page just consumes ActivityItem[] and the rest of
 * the codebase doesn't need to change when the underlying schema does.
 */

const PAGE_LIMIT = 50;

export interface UseActivityFeed {
  items: ActivityItem[];
  loading: boolean;
  error: string | null;
  /** Force a refetch — useful for pull-to-refresh or after a mutation. */
  refresh: () => void;
}

/**
 * Shape of one row returned by the `activity_items` view. Mirrors the
 * SELECT in migration 006 — keep these in sync.
 */
interface ActivityItemRow {
  id: string;
  user_id: string;
  athlete_id: string;
  tier: Tier;
  author_handle: string | null;
  author_display_name: string | null;
  platform: string;
  created_at: string;
  status: string | null;
  athlete_rating: string | null;
  content_action: string | null;
  account_action: string | null;
  is_repeat: boolean;
}

/** Map a DB row onto the page's typed ActivityItem. */
function rowToItem(row: ActivityItemRow): ActivityItem {
  const handle = row.author_handle ?? "unknown";
  const displayName =
    row.author_display_name && row.author_display_name !== "Unknown"
      ? row.author_display_name
      : handle;

  return {
    id: row.id,
    tier: row.tier,
    author: {
      displayName,
      handle,
      // `initials` and `avatarSlot` are intentionally left undefined so the
      // <Avatar> component falls back to the deterministic-from-handle hash.
      // Production data carries no hand-pinned palette overrides.
    },
    platform: normalizePlatform(row.platform),
    date: row.created_at,
    isRepeat: !!row.is_repeat,
    // Optional status/action labels — keep `undefined` to use tier defaults
    // unless the DB has a meaningful value to surface.
    status: undefined,
    action: undefined,
  };
}

/**
 * Whitelist platform strings to the Platform union when possible. Anything
 * unknown passes through verbatim — `Platform | string` accepts both, and
 * the row renderer treats unknown values as a generic platform pill.
 */
function normalizePlatform(p: string): Platform | string {
  if (p === "twitter" || p === "instagram" || p === "reddit") return p;
  return p;
}

export function useActivityFeed(): UseActivityFeed {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // bumping this triggers a refetch via the effect deps
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const supabase = getSupabaseBrowser();

        // RLS scopes the rows to the current athlete via the underlying
        // pipeline_runs / content_items policies. We don't need an explicit
        // `.eq("athlete_id", ...)` — but adding one would be a defense-in-
        // depth choice if the policies ever drift. We keep it RLS-only for
        // simplicity; the SQL test in 006 verifies cross-athlete isolation.
        const { data, error: queryError } = await supabase
          .from("activity_items")
          .select(
            "id, user_id, athlete_id, tier, author_handle, author_display_name, platform, created_at, status, athlete_rating, content_action, account_action, is_repeat",
          )
          .order("created_at", { ascending: false })
          .limit(PAGE_LIMIT);

        if (cancelled) return;

        if (queryError) {
          setError(queryError.message);
          setItems([]);
          setLoading(false);
          return;
        }

        const rows = (data ?? []) as unknown as ActivityItemRow[];
        setItems(rows.map(rowToItem));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load activity");
        setItems([]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return {
    items,
    loading,
    error,
    refresh: () => setRefreshKey((n) => n + 1),
  };
}
