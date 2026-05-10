"use client";

import type { PlatformRow } from "@/lib/mockDashboardData";

/**
 * Section 6 — "Platform Breakdown" card.
 *
 * One row per connected platform. Each row stacks:
 *   1. A header line with the platform name on the left and "<count> (<pct>%)"
 *      on the right.
 *   2. A 4px champagne progress bar whose fill width is the platform's share
 *      of total events (count / sumOfAllCounts).
 *
 * The card is intentionally simple — it summarises the chart above by
 * platform rather than tier. If `platforms` is empty (e.g., new account
 * with no scans yet) the card renders an unobtrusive "No data yet" line so
 * the empty state isn't a blank box.
 *
 * Numbers are computed locally from the `count` field — we don't trust any
 * pre-calculated percentages because the mock and real data shapes diverge
 * there.
 */
export default function PlatformBreakdown({
  platforms,
}: {
  platforms: PlatformRow[];
}) {
  const total = platforms.reduce((sum, p) => sum + p.count, 0);

  return (
    <section className="rounded-token-4 border border-line bg-ink-2 px-token-6 md:px-token-10 py-token-6 md:py-token-9">
      <h2 className="text-h3 md:text-base font-semibold text-stone mb-token-5 md:mb-token-7">
        Platform Breakdown
      </h2>

      {platforms.length === 0 || total === 0 ? (
        <p className="text-meta text-stone-3">
          No platform data yet — connect an account to start.
        </p>
      ) : (
        <div className="flex flex-col gap-token-4 md:gap-token-5">
          {platforms.map((platform) => {
            const pct = (platform.count / total) * 100;
            return (
              <div key={platform.name}>
                <div className="flex justify-between text-meta md:text-body mb-1.5">
                  <span className="text-stone">{platform.name}</span>
                  <span className="text-stone-3">
                    {platform.count} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1 bg-line rounded-token-1 overflow-hidden">
                  <div
                    className="h-full bg-champagne rounded-token-1"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
