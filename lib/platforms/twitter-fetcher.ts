import { getActiveToken, markTokenExpired } from "./token-service";
import type { TwitterContent } from "@/lib/agents/types";

// ── fetchMentions ──────────────────────────────────────────────────────────

export async function fetchMentions(
  userId: string,
  sinceId?: string
): Promise<TwitterContent[]> {
  const active = await getActiveToken(userId, "twitter");
  if (!active) {
    console.error("[twitter] No active token for user:", userId);
    return [];
  }

  const { accessToken, platformUserId } = active;

  if (!platformUserId) {
    console.error("[twitter] platformUserId is empty — reconnect Twitter to fix:", userId);
    return [];
  }

  try {
    console.log(`[twitter] fetching mentions for platformUserId=${platformUserId} sinceId=${sinceId ?? "none"}`);

    const url = new URL(
      `https://api.twitter.com/2/users/${platformUserId}/mentions`
    );
    url.searchParams.set("max_results", "20");
    url.searchParams.set(
      "tweet.fields",
      "created_at,author_id,text,public_metrics,conversation_id"
    );
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");
    if (sinceId) url.searchParams.set("since_id", sinceId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      console.warn("[twitter] Rate limited (429) for user:", userId);
      return [];
    }

    if (res.status === 401) {
      console.error("[twitter] Unauthorized (401) for user:", userId);
      await markTokenExpired(userId, "twitter");
      return [];
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[twitter] fetchMentions failed, status: ${res.status}, body: ${errBody}`);
      return [];
    }

    const data = await res.json() as {
      data?: Array<{
        id: string;
        text: string;
        author_id: string;
        created_at: string;
        conversation_id: string;
        public_metrics: {
          reply_count: number;
          retweet_count: number;
          like_count: number;
        };
      }>;
      includes?: {
        users?: Array<{ id: string; username: string }>;
      };
    };

    console.log(`[twitter] API returned ${data.data?.length ?? 0} mention(s)`);
    if (!data.data?.length) return [];

    const userMap = new Map<string, string>();
    for (const u of data.includes?.users ?? []) {
      userMap.set(u.id, u.username);
    }

    return data.data.map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      authorId: tweet.author_id,
      authorUsername: userMap.get(tweet.author_id) ?? tweet.author_id,
      createdAt: tweet.created_at,
      metrics: {
        replyCount: tweet.public_metrics.reply_count,
        retweetCount: tweet.public_metrics.retweet_count,
        likeCount: tweet.public_metrics.like_count,
      },
      conversationId: tweet.conversation_id,
      platform: "twitter" as const,
    }));
  } catch (err) {
    console.error("[twitter] fetchMentions threw:", err);
    return [];
  }
}

// ── hideTweet ──────────────────────────────────────────────────────────────

export async function hideTweet(userId: string, tweetId: string): Promise<boolean> {
  const active = await getActiveToken(userId, "twitter");
  if (!active) return false;

  try {
    const res = await fetch(`https://api.twitter.com/2/tweets/${tweetId}/hidden`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${active.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hidden: true }),
    });
    return res.ok;
  } catch (err) {
    console.error("[twitter] hideTweet threw:", err);
    return false;
  }
}

// ── deleteTweet ────────────────────────────────────────────────────────────

export async function deleteTweet(userId: string, tweetId: string): Promise<boolean> {
  const active = await getActiveToken(userId, "twitter");
  if (!active) return false;

  try {
    const res = await fetch(`https://api.twitter.com/2/tweets/${tweetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${active.accessToken}` },
    });
    return res.ok;
  } catch (err) {
    console.error("[twitter] deleteTweet threw:", err);
    return false;
  }
}

// ── muteSender ─────────────────────────────────────────────────────────────

export async function muteSender(userId: string, senderUserId: string): Promise<boolean> {
  const active = await getActiveToken(userId, "twitter");
  if (!active) return false;

  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/${active.platformUserId}/muting`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${active.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_user_id: senderUserId }),
      }
    );
    return res.ok;
  } catch (err) {
    console.error("[twitter] muteSender threw:", err);
    return false;
  }
}

// ── blockSender ────────────────────────────────────────────────────────────

export async function blockSender(userId: string, senderUserId: string): Promise<boolean> {
  const active = await getActiveToken(userId, "twitter");
  if (!active) return false;

  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/${active.platformUserId}/blocking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${active.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_user_id: senderUserId }),
      }
    );
    return res.ok;
  } catch (err) {
    console.error("[twitter] blockSender threw:", err);
    return false;
  }
}

// ── unblockUser ───────────────────────────────────────────────────────────
// Reverses a block that Whistle previously placed on a user.
// Twitter API: DELETE /2/users/{source_user_id}/blocking/{target_user_id}

export async function unblockUser(
  userId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  const active = await getActiveToken(userId, "twitter");
  if (!active) {
    return { success: false, error: "No active Twitter token" };
  }

  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/${active.platformUserId}/blocking/${targetUserId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${active.accessToken}` },
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      console.error(`[twitter] unblockUser failed, status: ${res.status}, body: ${errBody}`);
      return { success: false, error: `Twitter API returned ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[twitter] unblockUser threw:", err);
    return { success: false, error: message };
  }
}

export type { TwitterContent };
