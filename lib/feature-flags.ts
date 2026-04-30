// ── Feature flags ─────────────────────────────────────────────────────────────
// Per-feature toggles for hiding incomplete UI from beta users without
// removing the underlying code. Each flag defaults to OFF (hidden) so the
// app starts in beta-safe mode; flip an env var to "true" in Vercel
// (or .env.local for dev) to reveal a feature when it's ready.
//
// IMPORTANT: env vars must be NEXT_PUBLIC_-prefixed so Next.js inlines them
// into the client bundle. Without the prefix, the flag will read as
// undefined in browser components and stay hidden no matter what.
//
// Backend behavior is intentionally NOT gated by these flags — the poller,
// pipeline, allowlist check, block/mute actions, and DM webhook all keep
// running so data accumulates while the UI for each feature is built out.

const flag = (envVar: string | undefined): boolean =>
  envVar === "true" || envVar === "1";

export const FEATURES = {
  /** /messages page (DM monitoring view). Backend DM ingestion stays running. */
  messages: flag(process.env.NEXT_PUBLIC_FEATURE_MESSAGES),

  /** /blocked-users management UI. Backend block/mute actions stay enabled. */
  blockedUsers: flag(process.env.NEXT_PUBLIC_FEATURE_BLOCKED_USERS),

  /** Allowlist editor on /settings. Server-side allowlist checks stay running. */
  allowlist: flag(process.env.NEXT_PUBLIC_FEATURE_ALLOWLIST),

  /** Profile Toxicity Detection card on /settings. */
  profileToxicity: flag(process.env.NEXT_PUBLIC_FEATURE_PROFILE_TOXICITY),

  /** Betting Risk Analysis calendar on /settings. */
  bettingRisk: flag(process.env.NEXT_PUBLIC_FEATURE_BETTING_RISK),
} as const;

export type FeatureKey = keyof typeof FEATURES;
