/**
 * Mock data for the /dashboard page.
 *
 * Provisional source for the six dashboard sections (status line, waiting
 * block, recent-activity tier cards, scanned card, activity chart, platform
 * breakdown). Prompt 8 will replace this file with Supabase aggregations —
 * the components consume the typed shapes below so swapping the source
 * doesn't change any UI code.
 *
 * Editing tips:
 *   - Set `WAITING.critical` and `WAITING.calibrate` both to 0 to force the
 *     "All clear" branch in the WaitingBlock component.
 *   - Remove `STATUS.window` (or set it to null) to drop the 4th status-line
 *     metadata pill — the line then renders 3 pieces (per spec).
 *   - The chart series must each contain exactly 14 entries in chronological
 *     order; the chart maps date strings 1:1 onto the X-axis.
 */

import type { Tier } from "@/lib/tiers";

// ── Section 1: Status line ────────────────────────────────────────────────────

export interface DashboardStatus {
  /** Number of distinct social accounts being monitored. */
  accountsMonitored: number;
  /** Display string of the platforms (e.g., "Twitter and Instagram"). */
  platformsLabel: string;
  /** Minutes since the most recent scan completed. */
  lastScanMinutesAgo: number;
  /** Active monitoring window — null when no window is active. */
  window: {
    label: string; // e.g., "Game day window"
    endsInHours: number; // remaining hours
  } | null;
}

// ── Section 2: Waiting on you ─────────────────────────────────────────────────

export interface WaitingCounts {
  critical: number;
  calibrate: number;
}

// ── Section 3: Recent activity tier cards ─────────────────────────────────────

export interface TierStat {
  /** Count over the last 7 days. */
  last7Days: number;
  /** Count across the lifetime of the account. */
  allTime: number;
}

export type RecentActivityCounts = Record<Tier, TierStat>;

// ── Section 4: Posts scanned ──────────────────────────────────────────────────

export interface ScannedSummary {
  totalPostsScanned: number;
}

// ── Section 5: Activity chart (14 days, three series) ─────────────────────────

export interface ChartPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  critical: number;
  removed: number;
  calibrate: number;
}

// ── Section 6: Platform breakdown ─────────────────────────────────────────────

export interface PlatformRow {
  /** Display name (e.g., "Instagram"). */
  name: string;
  count: number;
}

// ── The mock dataset ──────────────────────────────────────────────────────────

export const STATUS: DashboardStatus = {
  accountsMonitored: 3,
  platformsLabel: "Twitter and Instagram",
  lastScanMinutesAgo: 2,
  window: {
    label: "Game day window",
    endsInHours: 4,
  },
};

export const WAITING: WaitingCounts = {
  critical: 1,
  calibrate: 2,
};

export const RECENT_ACTIVITY: RecentActivityCounts = {
  critical: { last7Days: 1, allTime: 1 },
  removed: { last7Days: 3, allTime: 14 },
  calibrate: { last7Days: 2, allTime: 8 },
};

export const SCANNED: ScannedSummary = {
  totalPostsScanned: 2341,
};

/**
 * Build a 14-day chart series ending today. Hardcoded counts mirror the
 * shape of the SVG in whistle_DESKTOP_1.html so the line behavior is
 * recognisably "the mockup" without committing to specific calendar dates.
 */
function buildChartSeries(): ChartPoint[] {
  const days = 14;
  // Hardcoded counts (oldest → newest). Index 12 spikes critical to 2,
  // matching the late-cycle bump in the desktop mockup.
  const critical = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0];
  const removed = [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1];
  const calibrate = [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0];

  const today = new Date();
  const series: ChartPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    series.push({
      date: date.toISOString().slice(0, 10),
      critical: critical[i] ?? 0,
      removed: removed[i] ?? 0,
      calibrate: calibrate[i] ?? 0,
    });
  }
  return series;
}

export const CHART_SERIES: ChartPoint[] = buildChartSeries();

export const PLATFORMS: PlatformRow[] = [
  { name: "Instagram", count: 4 },
  { name: "Twitter", count: 2 },
];

/**
 * Convenience aggregator — bundle every section's mock so the page imports
 * one symbol. Components still take their slice as a typed prop, which is
 * what makes the eventual Supabase swap a one-line change.
 */
export const MOCK_DASHBOARD = {
  status: STATUS,
  waiting: WAITING,
  recentActivity: RECENT_ACTIVITY,
  scanned: SCANNED,
  chartSeries: CHART_SERIES,
  platforms: PLATFORMS,
} as const;

export type MockDashboard = typeof MOCK_DASHBOARD;
