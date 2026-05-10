/**
 * Tier metadata — single source of truth for the three Whistle tiers.
 *
 * Both `TierBadge` and `TierSectionHeader` (and any future tier-aware UI)
 * import from here. To rename a tier, recolor a tier, or rewrite a subtitle,
 * edit one entry in this file — every consumer updates automatically.
 *
 * Color tokens (`--clay`, `--cobalt`, `--ochre` and their `-deep` variants)
 * live in app/tokens.css. Don't duplicate hex values here — that would
 * defeat the "single source of truth" contract from the design tokens work.
 */

export type Tier = "critical" | "removed" | "calibrate";

export const TIERS_IN_ORDER: readonly Tier[] = [
  "critical",
  "removed",
  "calibrate",
] as const;

export interface TierMeta {
  /** Stable id used in code, URLs, analytics. Lowercased English. */
  id: Tier;
  /** Display title in section headers. Capitalized. */
  title: string;
  /** Long subtitle, used on desktop. */
  subtitle: string;
  /** Short subtitle, used on mobile / cramped layouts. */
  subtitleCompact: string;
  /** Pill text. The badge component lowercases this; we store the canonical
   * spelling so a future change ("critical" → "severe") only happens here. */
  badgeLabel: string;
  /** CSS variable name for the primary tier color (no `var(...)` wrapper). */
  colorVar: `--${string}`;
  /** CSS variable name for the deep gradient stop. */
  colorDeepVar: `--${string}`;
}

export const TIERS: Record<Tier, TierMeta> = {
  critical: {
    id: "critical",
    title: "Critical",
    subtitle: "Flagged for law enforcement — evidence preserved",
    subtitleCompact: "Flagged for law enforcement",
    badgeLabel: "critical",
    colorVar: "--clay",
    colorDeepVar: "--clay-deep",
  },
  removed: {
    id: "removed",
    title: "Removed",
    subtitle: "Targeted insults, slurs, threats, and harassment",
    subtitleCompact: "Insults, slurs, threats, harassment",
    badgeLabel: "removed",
    colorVar: "--cobalt",
    colorDeepVar: "--cobalt-deep",
  },
  calibrate: {
    id: "calibrate",
    title: "Calibrate",
    subtitle: "Borderline content — rate it to teach Whistle your line",
    subtitleCompact: "Rate to teach Whistle your line",
    badgeLabel: "calibrate",
    colorVar: "--ochre",
    colorDeepVar: "--ochre-deep",
  },
};

/** Convenience helper — returns the linear-gradient string for a tier's
 * section header. Both stops are CSS variables so they always reflect the
 * latest token values. */
export function tierGradient(tier: Tier): string {
  const meta = TIERS[tier];
  return `linear-gradient(90deg, var(${meta.colorVar}) 0%, var(${meta.colorDeepVar}) 100%)`;
}
