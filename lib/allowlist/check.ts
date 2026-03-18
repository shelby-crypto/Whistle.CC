/**
 * Allowlist checking utilities.
 *
 * Two functions:
 * 1. loadExplicitAllowlistSet() — Loads the entire explicit allowlist for a
 *    user+platform into a Set at the start of each poll cycle. This avoids
 *    one DB query per content item.
 * 2. isAllowlisted() — Simple Set-based check combining explicit + followed.
 */

import { db } from "@/lib/db/supabase";

/**
 * Loads all explicit allowlist entries for a user on a given platform
 * into a Set containing both platform_user_id and platform_username values.
 * This set is meant to be built once per poll cycle and reused.
 */
export async function loadExplicitAllowlistSet(
  userId: string,
  platform: string,
): Promise<Set<string>> {
  const allowlistSet = new Set<string>();

  const { data, error } = await db
    .from("allowlisted_authors")
    .select("platform_user_id, platform_username")
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) {
    console.error("[allowlist] Failed to load explicit allowlist:", error.message);
    return allowlistSet;
  }

  for (const entry of data ?? []) {
    if (entry.platform_user_id) {
      allowlistSet.add(entry.platform_user_id);
    }
    if (entry.platform_username) {
      // Normalize: strip leading @ if present
      const normalized = entry.platform_username.replace(/^@/, "");
      allowlistSet.add(normalized);
      allowlistSet.add(entry.platform_username); // keep original too
    }
  }

  return allowlistSet;
}

/**
 * Checks whether a content author is in the combined allowlist set
 * (explicit entries + followed accounts merged together).
 *
 * Returns { allowed: boolean, reason: string } for audit logging.
 */
export function checkAllowlist(
  combinedSet: Set<string>,
  authorId: string | null,
  authorHandle: string | null,
): { allowed: boolean; reason: "author_allowlisted" | "author_followed" | "not_allowlisted" } {
  // Check by platform user ID first (more reliable)
  if (authorId && combinedSet.has(authorId)) {
    return { allowed: true, reason: "author_allowlisted" };
  }

  // Fallback: check by handle
  if (authorHandle) {
    const normalized = authorHandle.replace(/^@/, "");
    if (combinedSet.has(normalized) || combinedSet.has(authorHandle)) {
      return { allowed: true, reason: "author_allowlisted" };
    }
  }

  return { allowed: false, reason: "not_allowlisted" };
}
