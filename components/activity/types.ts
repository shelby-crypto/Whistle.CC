/**
 * Shape of a single row in the Activity feed.
 *
 * The feed surfaces three flavors of moderation events: critical (preserved
 * for law enforcement), removed (auto-removed harassment), and calibrate
 * (borderline content awaiting user input). Tier drives visual hierarchy and
 * which action affordance the row exposes.
 */

export type Tier = "critical" | "removed" | "calibrate";

/**
 * The post platform. Kept as a string union of the platforms beta supports;
 * extend rather than narrow when a new source comes online.
 */
export type Platform = "twitter" | "instagram" | "reddit";

/**
 * The 8 avatar palette slots defined in tokens.css (`--av-1` … `--av-8`).
 * Stored as a 1-indexed number so it lines up directly with the existing
 * `<Avatar tokenIndex>` prop. Used as a hand-pin for known authors who
 * appear in the mockups; everyone else falls back to the deterministic
 * hash on `handle`.
 */
export type AvatarSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ActivityAuthor {
  /** Display name shown on the top line of the row (e.g., "M. Torres"). */
  displayName: string;
  /** Handle without leading "@" (e.g., "m_torres_42"). */
  handle: string;
  /**
   * Optional override for the 2-character avatar initials. If omitted, the
   * initials are derived from `displayName`.
   */
  initials?: string;
  /**
   * Optional override for the avatar background color. If omitted, the slot
   * is derived deterministically from `handle` (same handle → same slot).
   * Pin this when you want a specific color for a known author (e.g., to
   * match a mockup or to keep VIP authors visually distinctive).
   */
  avatarSlot?: AvatarSlot;
  /**
   * Optional profile-picture URL. When provided, the Avatar component
   * renders the image on top of the initials disc; when the image fails to
   * load (or the URL is omitted) the initials remain. Currently sourced
   * from the demo author registry — wire to a real
   * `content_items.author_avatar_url` column once that ships.
   */
  avatarUrl?: string;
}

export interface ActivityItem {
  /** Stable id used for keys and detail-view routing. */
  id: string;
  /** Severity bucket — drives badge color and which action the row exposes. */
  tier: Tier;
  author: ActivityAuthor;
  platform: Platform | string;
  /** ISO 8601 date string (parseable by `new Date()`). */
  date: string;
  /** True when the same author has already been flagged on this account. */
  isRepeat: boolean;
  /**
   * Lower-case status label rendered inside the tier badge on desktop
   * (e.g., "critical", "removed", "calibrate"). Decoupled from `tier` so
   * future states ("pending", "appealed", ...) can ship without a tier
   * change. Defaults to the tier name when omitted.
   */
  status?: string;
  /**
   * Action label rendered in the action column. The render style is chosen
   * by tier (critical → green button, calibrate → outline button, removed →
   * plain text on desktop / hidden on mobile). Defaults are derived from
   * tier when omitted (see `defaultActionLabel`).
   */
  action?: string;
}

/**
 * Tier-driven default for the badge status text.
 */
export function defaultStatusLabel(tier: Tier): string {
  return tier;
}

/**
 * Tier-driven default for the action label. The mobile mockup uses "Rate"
 * while desktop uses "Rate this", so the variant matters here.
 */
export function defaultActionLabel(
  tier: Tier,
  variant: ActivityRowVariant,
): string {
  if (tier === "critical") return "Save evidence";
  if (tier === "removed") return "Removed";
  // calibrate
  return variant === "mobile" ? "Rate" : "Rate this";
}

export type ActivityRowVariant = "mobile" | "desktop";
