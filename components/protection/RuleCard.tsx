"use client";

import Toggle from "./Toggle";
import { TIERS, type Tier } from "@/lib/tiers";
import { TIER_TOGGLE_KEYS, TIER_TOGGLE_LABELS } from "@/lib/userSettings";

/**
 * Reusable card for a single auto-protection rule (one tier).
 *
 * Renders:
 *   - 3px tier-colored left border (clay / cobalt / ochre, sourced from
 *     `lib/tiers.ts` so a tier rename or color change picks up here for
 *     free).
 *   - Title (the tier name, capitalized) + one-line description of which
 *     content this tier matches.
 *   - One toggle row per key in `TIER_TOGGLE_KEYS[tier]`.
 *
 * The card is intentionally generic — same component handles all three
 * tiers, with the toggle list coming from the typed map. To add a fourth
 * tier later, extend `TIER_TOGGLE_KEYS` and the matching slice of
 * `UserSettings.autoProtection`; this component requires no changes.
 *
 * The Critical tier's `saveEvidence` toggle is rendered locked-on. The
 * `Toggle` component handles the visual treatment + tooltip; we intercept
 * the `onChange` here so the parent's setter can't accidentally flip it
 * even if a child component bypasses the lock.
 */
export interface RuleCardProps {
  tier: Tier;
  description: string;
  /** Map of toggle key → boolean state for this tier. */
  values: Record<string, boolean>;
  /** Called when a single toggle flips. Parent persists the change. */
  onToggle: (key: string, next: boolean) => void;
}

export default function RuleCard({
  tier,
  description,
  values,
  onToggle,
}: RuleCardProps) {
  const meta = TIERS[tier];
  const keys = TIER_TOGGLE_KEYS[tier];

  return (
    <div className="relative overflow-hidden rounded-token-4 border border-line bg-ink-2 px-token-7 py-token-7">
      {/* 3px tier-colored left border */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: `var(${meta.colorVar})` }}
      />

      <h3 className="text-body font-semibold text-stone mb-1 pl-1">
        {meta.title}
      </h3>
      <p className="text-micro text-stone-3 leading-snug mb-token-5 pl-1">
        {description}
      </p>

      <div className="flex flex-col gap-token-2">
        {keys.map((key) => {
          const isLocked = tier === "critical" && key === "saveEvidence";
          return (
            <div
              key={key}
              className="flex justify-between items-center text-body py-1"
            >
              <span className="text-stone-2">
                {TIER_TOGGLE_LABELS[key] ?? key}
              </span>
              <Toggle
                checked={values[key] ?? false}
                onChange={(next) => {
                  if (isLocked) return;
                  onToggle(key, next);
                }}
                locked={isLocked}
                ariaLabel={`${meta.title} — ${TIER_TOGGLE_LABELS[key] ?? key}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
