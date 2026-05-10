import { loadExplicitAllowlistSet } from "@/lib/allowlist/check";
import { fetchFollowedAccounts } from "@/lib/allowlist/followed-accounts";

/**
 * Build the combined allowlist Set used by every ingest path.
 *
 * Combines:
 *   - The explicit allowlist (rows in `allowlisted_authors` for this user
 *     + platform).
 *   - Followed accounts fetched from the platform API (Twitter `/following`,
 *     Instagram graph follows).
 *
 * Centralised here so all ingest sites — poll cron, webhook drain,
 * seed-demo, reprocess — call ONE function and stay consistent. The webhook
 * path was previously calling `processContentItem` with `allowlistSet`
 * undefined, which silently moderated content from allowlisted senders.
 *
 * Errors loading either source degrade open: a partial allowlist is
 * returned rather than throwing, with the failure logged. This keeps a
 * temporary platform API outage from blocking the whole pipeline.
 */
export async function loadCombinedAllowlist(
  userId: string,
  platform: string,
): Promise<Set<string>> {
  const [explicit, followed] = await Promise.all([
    loadExplicitAllowlistSet(userId, platform).catch((err) => {
      console.error("[allowlist] explicit load failed:", err);
      return new Set<string>();
    }),
    fetchFollowedAccounts(userId, platform).catch((err) => {
      console.error("[allowlist] followed-accounts load failed:", err);
      return new Set<string>();
    }),
  ]);
  return new Set<string>([...explicit, ...followed]);
}
