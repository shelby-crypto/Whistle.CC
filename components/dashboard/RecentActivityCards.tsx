"use client";

import { useRouter } from "next/navigation";
import { TIERS, TIERS_IN_ORDER, type Tier } from "@/lib/tiers";
import type { RecentActivityCounts } from "@/lib/mockDashboardData";

/**
 * Section 3 — the "Recent activity" tier cards.
 *
 * Renders one card per tier in the canonical order (critical → removed →
 * calibrate, sourced from `lib/tiers.ts` so a tier rename anywhere updates
 * here too). Each card surfaces the 7-day count as the headline number and
 * the all-time count as the supporting context line.
 *
 * Visual treatment changes per breakpoint:
 *   - Desktop: 3-column grid; each card has a 2px tier-colored top border.
 *   - Mobile:  vertical stack; each card has a 3px tier-colored left border
 *              and renders the number on the right of the tier label.
 *
 * Clicking a card routes to `/activity?tier=<id>`. The route is the same on
 * both breakpoints — the activity page handles its own filter persistence.
 */
export default function RecentActivityCards({
  counts,
}: {
  counts: RecentActivityCounts;
}) {
  return (
    <section className="mb-token-5 md:mb-token-5">
      <h2 className="font-serif text-h3 md:text-h2 mb-token-4 md:mb-token-5">
        Recent activity
      </h2>

      {/* Desktop: 3-column grid */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-token-5 mb-token-4">
        {TIERS_IN_ORDER.map((tier) => (
          <DesktopCard key={tier} tier={tier} stat={counts[tier]} />
        ))}
      </div>

      {/* Mobile: stacked rows */}
      <div className="md:hidden flex flex-col gap-token-3 mb-token-6">
        {TIERS_IN_ORDER.map((tier) => (
          <MobileCard key={tier} tier={tier} stat={counts[tier]} />
        ))}
      </div>
    </section>
  );
}

interface CardProps {
  tier: Tier;
  stat: { last7Days: number; allTime: number };
}

function DesktopCard({ tier, stat }: CardProps) {
  const router = useRouter();
  const meta = TIERS[tier];
  return (
    <button
      type="button"
      onClick={() => router.push(`/activity?tier=${tier}`)}
      className="relative overflow-hidden rounded-token-4 border border-line bg-ink-2 px-token-8 py-token-7 text-left cursor-pointer hover:bg-ink-3 transition-colors"
      aria-label={`View ${meta.title} activity`}
    >
      {/* 2px tier-colored top border */}
      <span
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: `var(${meta.colorVar})` }}
        aria-hidden
      />
      <div className="text-micro uppercase tracking-wider font-semibold text-stone-3 mb-token-2">
        {meta.title}
      </div>
      <div className="text-[32px] font-bold leading-none mb-1.5 text-stone">
        {stat.last7Days}
      </div>
      <div className="text-micro text-stone-4">
        Last 7 days · {stat.allTime} total all-time
      </div>
    </button>
  );
}

function MobileCard({ tier, stat }: CardProps) {
  const router = useRouter();
  const meta = TIERS[tier];
  return (
    <button
      type="button"
      onClick={() => router.push(`/activity?tier=${tier}`)}
      className="relative overflow-hidden rounded-token-4 border border-line bg-ink-2 px-token-6 py-token-5 flex justify-between items-center text-left w-full cursor-pointer"
      aria-label={`View ${meta.title} activity`}
    >
      {/* 3px tier-colored left border */}
      <span
        className="absolute top-0 bottom-0 left-0 w-[3px]"
        style={{ background: `var(${meta.colorVar})` }}
        aria-hidden
      />
      <div className="pl-1">
        <div className="text-micro uppercase tracking-wider font-semibold text-stone-3 mb-0.5">
          {meta.title}
        </div>
        <div className="text-micro text-stone-4">
          Last 7 days · {stat.allTime} all-time
        </div>
      </div>
      <div className="text-[26px] font-bold leading-none text-stone">
        {stat.last7Days}
      </div>
    </button>
  );
}
