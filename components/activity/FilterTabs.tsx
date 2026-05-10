"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Tier } from "./types";
import { useResponsiveVariant } from "./useResponsiveVariant";

/**
 * The four filter values the Activity feed supports. `all` is the default
 * and corresponds to "no `?tier=` param in the URL".
 */
export type ActivityFilter = "all" | Tier;

const FILTERS: ReadonlyArray<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "removed", label: "Removed" },
  { id: "calibrate", label: "Calibrate" },
];

/**
 * Read the active filter from the URL `?tier=` param. Anything we don't
 * recognise falls back to `"all"` so a malformed URL doesn't blank the feed.
 */
export function parseFilter(value: string | null | undefined): ActivityFilter {
  if (value === "critical" || value === "removed" || value === "calibrate") {
    return value;
  }
  return "all";
}

interface Props {
  /**
   * Optional override of the variant. When omitted, the responsive hook
   * picks based on viewport width.
   */
  variant?: "mobile" | "desktop";
}

/**
 * The four-tab filter row above the activity feed.
 *
 * Desktop variant: text tabs with a 2px champagne underline on the active
 * tab and a hairline beneath the row.
 *
 * Mobile variant: pill chips that horizontally scroll if the row overflows.
 *
 * State lives in the URL as `?tier=critical|removed|calibrate`. Switching
 * to "all" removes the param entirely so the canonical URL stays clean.
 */
export default function FilterTabs({ variant }: Props) {
  const detected = useResponsiveVariant();
  const resolved = variant ?? detected;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseFilter(searchParams.get("tier"));

  const onSelect = useCallback(
    (filter: ActivityFilter) => {
      const next = new URLSearchParams(searchParams.toString());
      if (filter === "all") {
        next.delete("tier");
      } else {
        next.set("tier", filter);
      }
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      // `replace` (vs push) keeps the back button useful — switching tabs
      // shouldn't pollute history.
      router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (resolved === "mobile") {
    return <MobilePillTabs active={active} onSelect={onSelect} />;
  }
  return <DesktopUnderlineTabs active={active} onSelect={onSelect} />;
}

interface InnerProps {
  active: ActivityFilter;
  onSelect: (filter: ActivityFilter) => void;
}

function DesktopUnderlineTabs({ active, onSelect }: InnerProps) {
  return (
    <div
      className="flex gap-token-11 border-b border-line mb-token-8"
      role="tablist"
      aria-label="Activity filter"
    >
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(f.id)}
            className={[
              "py-token-3 px-0 border-b-2 cursor-pointer bg-transparent",
              "text-[14px] font-sans transition-colors",
              isActive
                ? "text-stone border-champagne font-medium"
                : "text-stone-3 border-transparent hover:text-stone-2",
            ].join(" ")}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function MobilePillTabs({ active, onSelect }: InnerProps) {
  return (
    <div
      className="flex gap-token-2 px-token-8 pt-token-4 pb-token-2 overflow-x-auto border-b border-line scrollbar-hide"
      role="tablist"
      aria-label="Activity filter"
    >
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(f.id)}
            className={[
              "shrink-0 py-[6px] px-[14px] rounded-[16px] text-meta",
              "transition-colors",
              isActive
                ? "bg-champagne text-ink border border-champagne font-semibold"
                : "bg-transparent border border-line-2 text-stone-3 font-medium",
            ].join(" ")}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
