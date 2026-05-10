/**
 * Demo-only author identity resolver.
 *
 * Purpose
 * -------
 * The activity feed and detail views surface author handles, display names,
 * and profile pictures. In production, those fields come from the platform
 * APIs at ingest time — but right now:
 *   - We don't yet store author_display_name / author_avatar_url columns.
 *   - The Instagram Graph API's `comments` field expansion doesn't reliably
 *     return commenter usernames (Meta limitation), so the polled-comment
 *     code path hardcodes "instagram_user" as a placeholder.
 *
 * Until the full real-data path is built (schema migration + pipeline capture
 * + backfill), this module makes the demo deploy look right by mapping known
 * demo handles to richer identities and synthesising varied identities for
 * the "instagram_user" placeholder.
 *
 * Lifetime
 * --------
 * Temporary, demo-only. Delete this file when the production
 * `content_items.author_display_name` and `content_items.author_avatar_url`
 * columns ship and the activity_items view exposes them. The frontend
 * surface (Avatar, Removed detail, ActivityRow) only needs to be re-pointed
 * at those columns; no other change required.
 */

export interface AuthorIdentity {
  /** Handle without leading "@". May be the original platform handle or a
   *  synthesised demo handle (for the "instagram_user" placeholder case). */
  handle: string;
  /** Friendly display name for the top line of an author block. */
  displayName: string;
  /** Optional profile-picture URL. When omitted, the Avatar component falls
   *  back to its initials-only rendering. */
  avatarUrl?: string;
}

/**
 * pravatar.cc returns deterministic photo-style avatars when seeded with
 * `?u=<seed>`. Plain <img>-friendly, no auth, no Next/Image remote-pattern
 * config needed. Same seed in always returns the same face out.
 */
function pravatar(seed: string): string {
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`;
}

/**
 * Known demo handles seeded by /api/seed-demo. Mapping the seed-demo
 * authorUsername values directly so the Activity feed reads as a coherent
 * cast of characters rather than a wall of raw slugs.
 *
 * Keys are case-sensitive on the handle as stored in `content_items`.
 */
const KNOWN_AUTHORS: Record<string, AuthorIdentity> = {
  CoachDaveH: {
    handle: "CoachDaveH",
    displayName: "Coach Dave H.",
    avatarUrl: pravatar("CoachDaveH"),
  },
  SportsWatcher99: {
    handle: "SportsWatcher99",
    displayName: "Sports Watcher",
    avatarUrl: pravatar("SportsWatcher99"),
  },
  AngryFan_Riordan: {
    handle: "AngryFan_Riordan",
    displayName: "T. Riordan",
    avatarUrl: pravatar("AngryFan_Riordan"),
  },
  ThreatAccount_X7: {
    handle: "ThreatAccount_X7",
    displayName: "Anonymous (X7)",
    avatarUrl: pravatar("ThreatAccount_X7"),
  },
  CoordHarass_Real: {
    handle: "CoordHarass_Real",
    displayName: "J. Markham",
    avatarUrl: pravatar("CoordHarass_Real"),
  },
  BasketballMom_Tricia: {
    handle: "BasketballMom_Tricia",
    displayName: "Tricia M.",
    avatarUrl: pravatar("BasketballMom_Tricia"),
  },
  StalkThreat_Anon: {
    handle: "StalkThreat_Anon",
    displayName: "Anonymous account",
    avatarUrl: pravatar("StalkThreat_Anon"),
  },
};

/**
 * Pool of synthesised identities used when the stored handle is the generic
 * "instagram_user" placeholder. Picked deterministically by the row's id so
 * a given activity row always renders as the same fake person across reloads
 * and navigations — no "shuffling avatar" UX bug.
 *
 * Avatar seeds are stable strings (not the picked handles) so changing the
 * display name later doesn't invalidate every face.
 */
const IG_PLACEHOLDER_POOL: AuthorIdentity[] = [
  { handle: "marlowe.q", displayName: "Marlowe Quinn", avatarUrl: pravatar("ig-pool-01") },
  { handle: "the_real_jpark", displayName: "Jordan Park", avatarUrl: pravatar("ig-pool-02") },
  { handle: "soren.b", displayName: "Søren Bauer", avatarUrl: pravatar("ig-pool-03") },
  { handle: "amelia.r", displayName: "Amelia Reyes", avatarUrl: pravatar("ig-pool-04") },
  { handle: "k.tanaka", displayName: "Kenji Tanaka", avatarUrl: pravatar("ig-pool-05") },
  { handle: "valentina.s", displayName: "Valentina Soto", avatarUrl: pravatar("ig-pool-06") },
  { handle: "djember", displayName: "DJ Ember", avatarUrl: pravatar("ig-pool-07") },
  { handle: "huxley.f", displayName: "Huxley Fields", avatarUrl: pravatar("ig-pool-08") },
];

/**
 * Cheap, stable string hash (djb2). Enough determinism for "pick one of N"
 * without pulling in a real hash library. Returns a non-negative 32-bit int.
 */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  // Force unsigned so the modulo math below stays well-defined.
  return hash >>> 0;
}

/**
 * Resolve a stored handle into a full demo identity.
 *
 * - Known seed-demo handle → registry entry (real-looking name + photo).
 * - "instagram_user" placeholder → deterministic pick from the pool, keyed
 *   by `rowId` so the same row always looks the same.
 * - Anything else → identity falls through with handle as the display name
 *   and no avatar URL (Avatar will render initials).
 *
 * `rowId` is the activity_items row id (== pipeline_runs id). Pass the same
 * id used to navigate to the detail view so the feed row and the detail
 * card render the same identity.
 */
export function resolveAuthorIdentity(
  storedHandle: string | null | undefined,
  rowId: string,
): AuthorIdentity {
  const handle = (storedHandle ?? "").trim();

  if (handle && KNOWN_AUTHORS[handle]) {
    return KNOWN_AUTHORS[handle];
  }

  if (handle === "" || handle === "instagram_user" || handle === "unknown") {
    const idx = hashString(rowId || handle) % IG_PLACEHOLDER_POOL.length;
    return IG_PLACEHOLDER_POOL[idx];
  }

  // Real-looking handle we don't have a registry entry for — surface as-is.
  return {
    handle,
    displayName: handle,
    // No avatarUrl → Avatar renders initials.
  };
}
