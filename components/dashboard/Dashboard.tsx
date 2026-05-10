"use client";

import StatusLine from "./StatusLine";
import WaitingBlock from "./WaitingBlock";
import RecentActivityCards from "./RecentActivityCards";
import ScannedCard from "./ScannedCard";
import ActivityChart from "./ActivityChart";
import PlatformBreakdown from "./PlatformBreakdown";
import SectionError from "@/components/SectionError";
import ConnectAccountsCTA from "./ConnectAccountsCTA";
import { useDashboard } from "./useDashboard";

/**
 * Composition root for the dashboard page.
 *
 * Renders the six sections in spec order:
 *   1. StatusLine            (You're protected.)
 *   2. WaitingBlock          (Action queue or All-clear)
 *   3. RecentActivityCards   (Critical / Removed / Calibrate)
 *   4. ScannedCard           (running post-scan total)
 *   5. ActivityChart         (14-day Recharts line chart)
 *   6. PlatformBreakdown     (per-platform progress bars)
 *
 * Data path: `useDashboard` hits the `dashboard_summary` RPC and caches
 * for 30s. The Refresh button bypasses the cache.
 *
 * State coverage:
 *   - loading (no data yet)         → DashboardSkeleton
 *   - loaded with zero accounts     → ConnectAccountsCTA above the sections
 *   - loaded with data              → six sections render normally
 *   - query failed                  → SectionError with Try again, the
 *                                     skeleton stays visible underneath so
 *                                     the page never blanks
 *   - unauthenticated / null data   → DashboardZeroState (empty scaffold)
 */
export default function Dashboard() {
  const { data, loading, error, refresh } = useDashboard();

  return (
    <div className="min-h-full">
      {/* Page header — title + Refresh button. Sticky on desktop so the
          refresh action stays reachable while the user scrolls through
          the chart and platform breakdown. */}
      <div className="border-b border-line bg-ink sticky top-0 z-40 md:static">
        <div className="max-w-[1100px] mx-auto px-token-5 md:px-token-12 py-token-5 md:py-token-7 flex justify-between items-center">
          <h1 className="font-serif text-h2 md:text-display text-stone leading-tight">
            Dashboard
          </h1>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="bg-champagne text-ink rounded-token-3 font-semibold text-meta px-token-7 py-token-2 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-token-5 md:px-token-12 py-token-5 md:py-token-7">
        {/* Section-level error: appears at the top of the content column,
            replaces nothing — the skeleton or last-cached data renders below
            so the page keeps its shape. */}
        {error && (
          <SectionError
            what="Dashboard summary"
            error={error}
            onRetry={refresh}
          />
        )}

        {/* New-athlete onboarding CTA. Shows when authenticated but no
            social accounts are connected. Sits above the (empty) sections
            so the rest of the dashboard still hints at what's coming. */}
        {data && data.status.accountsMonitored === 0 && (
          <ConnectAccountsCTA />
        )}

        {/* Loading state: render skeletons sized to the eventual content
            so the page doesn't reflow when the RPC resolves. */}
        {!data && loading ? (
          <DashboardSkeleton />
        ) : data ? (
          <>
            <StatusLine status={data.status} />
            <WaitingBlock waiting={data.waiting} />
            <RecentActivityCards counts={data.recentActivity} />
            <ScannedCard scanned={data.scanned} />
            <ActivityChart series={data.chartSeries} />
            <PlatformBreakdown platforms={data.platforms} />
          </>
        ) : (
          // No data and not loading — render zeros (mostly the
          // unauthenticated-fallback path).
          <DashboardZeroState />
        )}
      </div>
    </div>
  );
}

/**
 * First-load skeleton. Six sections, each sized to its eventual content,
 * so the page doesn't shift when the data arrives.
 *
 * The chart placeholder includes a "Loading activity…" caption per spec —
 * a quiet hint that the empty rectangle is intentional rather than broken.
 *
 * Uses Tailwind's `animate-pulse` for the breathing effect on the
 * placeholder rectangles. The chart caption text doesn't pulse so it
 * stays readable.
 */
function DashboardSkeleton() {
  return (
    <div>
      {/* 1. Status line — single full-width bar */}
      <div className="rounded-token-3 mb-token-8 h-[44px] bg-ink-2 border border-line animate-pulse" />

      {/* 2. Waiting block — header + two rows */}
      <div className="rounded-token-5 border border-line bg-ink-2 px-token-10 py-token-9 mb-token-11 animate-pulse">
        <div className="h-[20px] w-1/3 bg-ink-3 rounded-token-2 mb-token-5" />
        <div className="h-[44px] bg-ink-3 rounded-token-3 mb-token-3" />
        <div className="h-[44px] bg-ink-3 rounded-token-3" />
      </div>

      {/* 3. Tier cards — three side-by-side with placeholder big numbers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-token-5 mb-token-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-token-4 border border-line bg-ink-2 px-token-8 py-token-7 animate-pulse"
          >
            {/* tier label placeholder */}
            <div className="h-[12px] w-16 bg-ink-3 rounded-token-2 mb-token-3" />
            {/* the big number */}
            <div className="h-[28px] w-12 bg-ink-3 rounded-token-2 mb-token-3" />
            {/* helper line */}
            <div className="h-[10px] w-3/4 bg-ink-3 rounded-token-2" />
          </div>
        ))}
      </div>

      {/* 4. Scanned row */}
      <div className="rounded-token-4 border border-line bg-ink-2 h-[44px] mb-token-11 animate-pulse" />

      {/* 5. Chart — placeholder with a quiet "Loading activity…" caption.
            The container is the same size as the live chart so the page
            doesn't reflow when the data resolves. */}
      <div className="rounded-token-4 border border-line bg-ink-2 px-token-6 md:px-token-10 py-token-6 md:py-token-9 mb-token-11">
        <header className="mb-token-8">
          <div className="h-[20px] w-1/3 bg-ink-3 rounded-token-2 animate-pulse" />
        </header>
        <div className="h-[180px] md:h-[280px] bg-ink-3 rounded-token-3 flex items-center justify-center">
          <span className="text-meta text-stone-3">Loading activity…</span>
        </div>
      </div>

      {/* 6. Platform breakdown */}
      <div className="rounded-token-4 border border-line bg-ink-2 px-token-10 py-token-9 h-[180px] animate-pulse" />
    </div>
  );
}

/**
 * No-data fallback for the unauthenticated case. The dashboard_summary RPC
 * returns `{ unauthenticated: true }` for that path; we render an empty
 * scaffold so the page still has shape rather than appearing broken.
 */
function DashboardZeroState() {
  const empty = {
    status: {
      accountsMonitored: 0,
      platformsLabel: "no connected platforms",
      lastScanMinutesAgo: 0,
      window: null as null,
    },
    waiting: { critical: 0, calibrate: 0 },
    recentActivity: {
      critical: { last7Days: 0, allTime: 0 },
      removed: { last7Days: 0, allTime: 0 },
      calibrate: { last7Days: 0, allTime: 0 },
    },
    scanned: { totalPostsScanned: 0 },
    chartSeries: [],
    platforms: [],
  };
  return (
    <>
      <StatusLine status={empty.status} />
      <WaitingBlock waiting={empty.waiting} />
      <RecentActivityCards counts={empty.recentActivity} />
      <ScannedCard scanned={empty.scanned} />
      <ActivityChart series={empty.chartSeries} />
      <PlatformBreakdown platforms={empty.platforms} />
    </>
  );
}
