/**
 * Fetches followed accounts from social platforms for implicit allowlisting.
 *
 * When a player follows someone on Twitter, content from that person
 * should never be moderated. This module fetches the player's following
 * list and returns it as a Set for O(1) lookup during polling.
 *
 * Instagram limitation: The Instagram Graph API does not expose a
 * "following" endpoint, so implicit allowlisting only works on Twitter.
 */

import { getActiveToken } from "@/lib/platforms/token-service";

export async function fetchFollowedAccounts(
  userId: string,
  platform: string,
): Promise<Set<string>> {
  const followedIds = new Set<string>();

  if (platform === "twitter") {
    const active = await getActiveToken(userId, "twitter");
    if (!active?.accessToken || !active?.platformUserId) {
      console.warn("[allowlist] No active Twitter token for user:", userId);
      return followedIds;
    }

    try {
      let paginationToken: string | undefined;
      do {
        const url = new URL(
          `https://api.twitter.com/2/users/${active.platformUserId}/following`
        );
        url.searchParams.set("max_results", "1000");
        url.searchParams.set("user.fields", "username");
        if (paginationToken) {
          url.searchParams.set("pagination_token", paginationToken);
        }

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${active.accessToken}` },
        });

        if (res.status === 429) {
          console.warn("[allowlist] Rate limited fetching followed accounts for user:", userId);
          break; // Return what we have so far
        }

        if (!res.ok) {
          console.error(
            `[allowlist] Failed to fetch followed accounts: ${res.status}`
          );
          break;
        }

        const json = (await res.json()) as {
          data?: Array<{ id: string; username: string }>;
          meta?: { next_token?: string; result_count?: number };
        };

        for (const user of json.data ?? []) {
          followedIds.add(user.id);        // numeric ID — primary match key
          followedIds.add(user.username);   // handle — fallback match key
        }

        paginationToken = json.meta?.next_token;
      } while (paginationToken);

      console.log(
        `[allowlist] Fetched ${followedIds.size / 2} followed accounts for Twitter user ${userId}`
      );
    } catch (err) {
      console.error("[allowlist] Error fetching followed accounts:", err);
    }
  }

  if (platform === "instagram") {
    // Instagram Business/Graph API does not expose a "following" list endpoint.
    // Only explicit allowlist entries apply for Instagram.
    // This is communicated in the UI so players know to add Instagram contacts manually.
    console.info(
      "[allowlist] Instagram does not support fetching followed accounts via API"
    );
  }

  return followedIds;
}
