/**
 * Typed schema for the `user_settings` table.
 *
 * The DB column is JSONB so the shape can evolve without a migration; the
 * types below are the single source of truth on the application side.
 * Add a new toggle by:
 *   1. Adding the field to the appropriate tier in `AutoProtection`.
 *   2. Adding a default in `DEFAULT_USER_SETTINGS`.
 *   3. (Optional) Surfacing it as a row in the `RuleCard` for that tier.
 *
 * All tier rule values are booleans today. If a future setting needs a
 * non-boolean (e.g. a sensitivity slider), introduce a new sibling field
 * rather than overloading the existing toggle map — the RuleCard component
 * is intentionally typed against `Record<string, boolean>`.
 */

import type { Tier } from "@/lib/tiers";

// ── Section 1: Social Listening ──────────────────────────────────────────────

export interface SocialListeningSettings {
  searchQuery: string;
  platforms: {
    twitter: boolean;
    instagram: boolean;
    reddit: boolean;
  };
}

// ── Section 2: Auto-Protection rules ─────────────────────────────────────────

export interface CriticalRules {
  block: boolean;
  remove: boolean;
  /** Mandatory ON for Critical tier — UI locks this toggle. */
  saveEvidence: boolean;
}

export interface RemovedRules {
  block: boolean;
  remove: boolean;
  mute: boolean;
}

export interface CalibrateRules {
  surfaceForRating: boolean;
  autoMute: boolean;
  autoRemove: boolean;
}

export type AutoProtection = {
  critical: CriticalRules;
  removed: RemovedRules;
  calibrate: CalibrateRules;
};

// ── The full settings document ───────────────────────────────────────────────

export interface UserSettings {
  socialListening: SocialListeningSettings;
  autoProtection: AutoProtection;
}

/**
 * Defaults applied both client-side (when no row exists yet) and at the DB
 * layer (the migration's `DEFAULT` clauses mirror these). Keep them in sync
 * — if you add a field, update both this object and the migration.
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  socialListening: {
    searchQuery: "",
    platforms: {
      twitter: true,
      instagram: false,
      reddit: false,
    },
  },
  autoProtection: {
    critical: { block: true, remove: true, saveEvidence: true },
    removed: { block: true, remove: true, mute: false },
    calibrate: { surfaceForRating: true, autoMute: false, autoRemove: false },
  },
};

/**
 * Merge a partial document (typically what the DB returns) onto the
 * defaults. Any field the DB hasn't seen yet (e.g. a new toggle added
 * after the row was first inserted) gets the default value, so a fresh
 * deploy doesn't show empty toggles for a returning user.
 */
export function mergeWithDefaults(
  partial: Partial<UserSettings> | null | undefined,
): UserSettings {
  if (!partial) return DEFAULT_USER_SETTINGS;
  return {
    socialListening: {
      ...DEFAULT_USER_SETTINGS.socialListening,
      ...(partial.socialListening ?? {}),
      platforms: {
        ...DEFAULT_USER_SETTINGS.socialListening.platforms,
        ...(partial.socialListening?.platforms ?? {}),
      },
    },
    autoProtection: {
      critical: {
        ...DEFAULT_USER_SETTINGS.autoProtection.critical,
        ...(partial.autoProtection?.critical ?? {}),
      },
      removed: {
        ...DEFAULT_USER_SETTINGS.autoProtection.removed,
        ...(partial.autoProtection?.removed ?? {}),
      },
      calibrate: {
        ...DEFAULT_USER_SETTINGS.autoProtection.calibrate,
        ...(partial.autoProtection?.calibrate ?? {}),
      },
    },
  };
}

/**
 * Apply the immutable rule that Critical's `saveEvidence` is always true.
 * Called on every persisted update as a safety net — even if the client
 * somehow flips it off (devtools, malformed request) the saved value stays
 * true. The DB-layer rule could also be a CHECK constraint; the JSONB
 * column shape makes that awkward, so we enforce in the application.
 */
export function enforceInvariants(settings: UserSettings): UserSettings {
  return {
    ...settings,
    autoProtection: {
      ...settings.autoProtection,
      critical: { ...settings.autoProtection.critical, saveEvidence: true },
    },
  };
}

/**
 * Tier id → list of toggle keys, in display order. Drives the rows inside
 * each `RuleCard`. Keep this aligned with the tier-specific interfaces
 * above — TypeScript will complain if a tier-specific key doesn't match.
 */
export const TIER_TOGGLE_KEYS: Record<Tier, ReadonlyArray<string>> = {
  critical: ["block", "remove", "saveEvidence"],
  removed: ["block", "remove", "mute"],
  calibrate: ["surfaceForRating", "autoMute", "autoRemove"],
} as const;

/** Human-readable labels for each toggle. Kept here so the migration and
 * the UI agree on what each key means. */
export const TIER_TOGGLE_LABELS: Record<string, string> = {
  block: "Block",
  remove: "Remove",
  mute: "Mute",
  saveEvidence: "Save evidence",
  surfaceForRating: "Surface for rating",
  autoMute: "Auto-mute",
  autoRemove: "Auto-remove",
};
