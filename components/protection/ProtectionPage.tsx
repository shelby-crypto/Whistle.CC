"use client";

import { TIERS_IN_ORDER } from "@/lib/tiers";
import SectionError from "@/components/SectionError";
import SocialListening from "./SocialListening";
import RuleCard from "./RuleCard";
import MonitoringWindows from "./MonitoringWindows";
import { useUserSettings } from "./useUserSettings";

/**
 * Composition root for the /protection page.
 *
 * Three sections in spec order:
 *   1. Social Listening (search query + platform multi-select)
 *   2. Auto-Protection Rules (3 tier cards, each with 3 toggle rows)
 *   3. Monitoring Windows (heading + create button + dashed empty state)
 *
 * State + persistence is centralized in the `useUserSettings` hook so the
 * three sub-sections stay presentational. The hook debounces writes by
 * 250ms — well inside the 1-second acceptance bound for Removed and
 * Calibrate toggle changes — and flushes on unmount so a quick page-leave
 * doesn't lose the latest toggle.
 *
 * Tier-specific descriptions live here (rather than in `lib/tiers.ts`)
 * because the protection page's wording is more direct than the activity
 * feed's. Keeping them local makes A/B copy changes a single-file edit.
 */
const TIER_DESCRIPTIONS = {
  critical:
    "Doxxing, credible threats with specifics. Always removed; evidence preserved.",
  removed: "Targeted insults, slurs, general threats, harassment.",
  calibrate: "Borderline content. Surfaces in your feed for rating.",
} as const;

export default function ProtectionPage() {
  const { settings, loading, error, update, setRuleToggle } = useUserSettings();

  return (
    <div className="min-h-full">
      {/* Page header */}
      <div className="border-b border-line bg-ink">
        <div className="max-w-[1100px] mx-auto px-token-5 md:px-token-12 py-token-5 md:py-token-7">
          <h1 className="font-serif text-h2 md:text-display text-stone leading-tight">
            Protection Settings
          </h1>
          <p className="text-meta text-stone-3 mt-1">
            Configure how Whistle protects your online presence
          </p>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-token-5 md:px-token-12 py-token-5 md:py-token-7">
        {/* Section-level error — re-trigger by reloading the page (the
            hook isn't structured for partial refetch since most of its
            state is in-memory). The user can keep editing while error is
            visible; their changes still flush to Supabase on the next
            successful write. */}
        {error && (
          <SectionError
            what="Settings sync"
            error={error}
            onRetry={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          />
        )}

        {/* Loading state: a skeleton sized to the eventual page so the
            layout doesn't jump when defaults arrive. The toggles render
            in their default positions per spec — gives the user a sense
            of what they'll be configuring. */}
        {loading ? (
          <ProtectionSkeleton />
        ) : (
          <>
            <SocialListening
              value={settings.socialListening}
              onChangeQuery={(searchQuery) =>
                update({
                  socialListening: { ...settings.socialListening, searchQuery },
                })
              }
              onTogglePlatform={(key, next) =>
                update({
                  socialListening: {
                    ...settings.socialListening,
                    platforms: {
                      ...settings.socialListening.platforms,
                      [key]: next,
                    },
                  },
                })
              }
            />

            <section className="mb-token-12">
              <h2 className="text-body md:text-base font-semibold text-stone mb-token-4">
                Auto-Protection Rules
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-token-5">
                {TIERS_IN_ORDER.map((tier) => (
                  <RuleCard
                    key={tier}
                    tier={tier}
                    description={TIER_DESCRIPTIONS[tier]}
                    values={
                      settings.autoProtection[tier] as unknown as Record<
                        string,
                        boolean
                      >
                    }
                    onToggle={(key, next) => setRuleToggle(tier, key, next)}
                  />
                ))}
              </div>
            </section>

            <MonitoringWindows />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * First-load skeleton for /protection. Three sections sized to match the
 * eventual layout, with toggle placeholders rendered in their default
 * positions (per spec) so the page communicates what's coming.
 *
 * Toggle defaults are taken straight from DEFAULT_USER_SETTINGS:
 *   critical:  block on,  remove on,  saveEvidence on  (locked)
 *   removed:   block on,  remove on,  mute off
 *   calibrate: surfaceForRating on, autoMute off, autoRemove off
 *
 * We don't import the typed defaults to avoid coupling the skeleton to
 * the runtime hook — if the defaults shift slightly the skeleton stays
 * representative until the real values land.
 */
function ProtectionSkeleton() {
  const TIER_PLACEHOLDERS: Array<{
    title: string;
    color: string;
    rows: Array<{ label: string; on: boolean }>;
  }> = [
    {
      title: "Critical",
      color: "var(--clay)",
      rows: [
        { label: "Block", on: true },
        { label: "Remove", on: true },
        { label: "Save evidence", on: true },
      ],
    },
    {
      title: "Removed",
      color: "var(--cobalt)",
      rows: [
        { label: "Block", on: true },
        { label: "Remove", on: true },
        { label: "Mute", on: false },
      ],
    },
    {
      title: "Calibrate",
      color: "var(--ochre)",
      rows: [
        { label: "Surface for rating", on: true },
        { label: "Auto-mute", on: false },
        { label: "Auto-remove", on: false },
      ],
    },
  ];

  return (
    <div aria-busy="true">
      {/* Section 1: Social Listening */}
      <section className="mb-token-12">
        <h2 className="text-body md:text-base font-semibold text-stone mb-token-4">
          Social Listening
        </h2>
        <div className="rounded-token-4 border border-line bg-ink-2 p-token-7 animate-pulse">
          <div className="h-[10px] w-24 bg-ink-3 rounded-token-2 mb-2" />
          <div className="h-[44px] bg-ink-3 rounded-token-3 mb-token-5" />
          <div className="h-[10px] w-20 bg-ink-3 rounded-token-2 mb-token-2" />
          <div className="flex gap-token-2">
            <div className="h-[28px] w-20 bg-ink-3 rounded-full" />
            <div className="h-[28px] w-20 bg-ink-3 rounded-full" />
            <div className="h-[28px] w-16 bg-ink-3 rounded-full" />
          </div>
        </div>
      </section>

      {/* Section 2: Auto-Protection Rules — render real toggle shapes in
          their default positions so the user sees the page they'll be
          working with, not a blob of grey. */}
      <section className="mb-token-12">
        <h2 className="text-body md:text-base font-semibold text-stone mb-token-4">
          Auto-Protection Rules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-token-5">
          {TIER_PLACEHOLDERS.map((tier) => (
            <div
              key={tier.title}
              className="relative overflow-hidden rounded-token-4 border border-line bg-ink-2 px-token-7 py-token-7"
            >
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: tier.color }}
              />
              <h3 className="text-body font-semibold text-stone mb-1 pl-1">
                {tier.title}
              </h3>
              {/* Description placeholder — shimmering grey, not real copy
                  to make the loading-vs-loaded distinction obvious. */}
              <div className="h-[10px] w-3/4 bg-ink-3 rounded-token-2 mb-token-5 animate-pulse" />
              <div className="flex flex-col gap-token-2">
                {tier.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center text-body py-1"
                  >
                    <span className="text-stone-2">{row.label}</span>
                    <SkeletonToggle on={row.on} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Monitoring Windows */}
      <section className="mb-token-7 animate-pulse">
        <header className="flex justify-between items-center mb-token-4">
          <div className="h-[16px] w-44 bg-ink-3 rounded-token-2" />
          <div className="h-[28px] w-32 bg-ink-3 rounded-token-3" />
        </header>
        <div className="rounded-token-4 border border-dashed border-line-2 bg-ink-2 px-token-6 py-token-12" />
      </section>
    </div>
  );
}

/**
 * Static toggle drawn in its on/off default position. Doesn't reach into
 * the real Toggle component because the skeleton is in-flight and we
 * don't want it to be interactive. Sizes mirror Toggle's track/circle
 * dimensions so the layout stays consistent when the real toggles render.
 */
function SkeletonToggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative shrink-0 rounded-full
        w-8 h-[18px] md:w-8 md:h-[18px]
        max-md:w-10 max-md:h-[22px]
        ${on ? "bg-champagne opacity-60" : "bg-neutral opacity-60"}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] block rounded-full bg-white opacity-80
          w-[14px] h-[14px] max-md:w-[18px] max-md:h-[18px]
          ${on ? "translate-x-[14px] max-md:translate-x-[18px]" : "translate-x-0"}`}
        style={{ transform: undefined }}
      />
    </span>
  );
}
