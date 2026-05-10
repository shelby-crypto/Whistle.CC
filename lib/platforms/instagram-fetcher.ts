import { getActiveToken, markTokenExpired } from "./token-service";
import type { InstagramContent } from "@/lib/agents/types";

const IG_GRAPH = "https://graph.instagram.com";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── fetchRecentComments ────────────────────────────────────────────────────
// NOTE: Instagram comment fetching via the Instagram Login API (graph.instagram.com)
// is currently returning empty data from Meta's API despite correct permissions.
// This is a known Meta platform limitation — the function returns [] gracefully
// until the upstream API issue is resolved (likely requires Live Mode + App Review).

export async function fetchRecentComments(
  userId: string
): Promise<InstagramContent[]> {
  const active = await getActiveToken(userId, "instagram");
  if (!active) {
    console.error("[instagram] No active token for user:", userId);
    return [];
  }
  const { accessToken } = active;

  try {
    // P1-16: keep the access token out of the URL — Meta's edge logs and
    // any intermediate proxies will record query strings. Bearer header
    // is supported by graph.instagram.com for all GET requests.
    const mediaUrl = new URL(`${IG_GRAPH}/me/media`);
    mediaUrl.searchParams.set(
      "fields",
      "id,timestamp,comments_count,comments{id,text,timestamp}"
    );
    mediaUrl.searchParams.set("limit", "25");

    const mediaRes = await fetch(mediaUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (mediaRes.status === 401) {
      console.error("[instagram] Unauthorized (401) for user:", userId);
      await markTokenExpired(userId, "instagram");
      return [];
    }

    if (!mediaRes.ok) {
      const errBody = await mediaRes.text().catch(() => "");
      console.error("[instagram] Failed to fetch media, status:", mediaRes.status, errBody);
      return [];
    }

    const mediaData = await mediaRes.json() as {
      data?: Array<{
        id: string;
        timestamp: string;
        comments_count?: number;
        comments?: {
          data: Array<{ id: string; text: string; timestamp: string }>;
        };
      }>;
    };

    if (!mediaData.data?.length) return [];

    const commentCutoff = Date.now() - SEVEN_DAYS_MS;
    const allComments: InstagramContent[] = [];

    for (const post of mediaData.data) {
      const comments = post.comments?.data ?? [];
      const recentComments = comments.filter(
        (c) => new Date(c.timestamp).getTime() > commentCutoff
      );

      // Fallback: try direct /{media_id}/comments edge if field expansion returned nothing
      let commentsToProcess = recentComments;
      if (comments.length === 0 && (post.comments_count ?? 0) > 0) {
        const directUrl = new URL(`${IG_GRAPH}/${post.id}/comments`);
        directUrl.searchParams.set("fields", "id,text,timestamp");
        directUrl.searchParams.set("access_token", accessToken);
        const directRes = await fetch(directUrl.toString());
        if (directRes.ok) {
          const directData = await directRes.json() as {
            data?: Array<{ id: string; text: string; timestamp: string }>;
          };
          commentsToProcess = (directData.data ?? []).filter(
            (c) => new Date(c.timestamp).getTime() > commentCutoff
          );
        }
      }

      for (const comment of commentsToProcess) {
        allComments.push({
          id: comment.id,
          text: comment.text,
          authorUsername: "instagram_user",
          mediaId: post.id,
          createdAt: comment.timestamp,
          platform: "instagram" as const,
        });
      }
    }

    return allComments;
  } catch (err) {
    console.error("[instagram] fetchRecentComments threw:", err);
    return [];
  }
}

// ── hideComment ────────────────────────────────────────────────────────────

export async function hideComment(userId: string, commentId: string): Promise<boolean> {
  const active = await getActiveToken(userId, "instagram");
  if (!active) return false;

  try {
    // P1-16: hide=true belongs in the POST body alongside the bearer
    // auth header, not in the URL.
    const body = new URLSearchParams({ hide: "true" });
    const res = await fetch(`${IG_GRAPH}/${commentId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${active.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    return res.ok;
  } catch (err) {
    console.error("[instagram] hideComment threw:", err);
    return false;
  }
}

// ── deleteComment ──────────────────────────────────────────────────────────
// PERMANENT — only called when final_risk_level = severe AND action agent
// confirmed delete with a populated irreversible_action_justification.

export async function deleteComment(userId: string, commentId: string): Promise<boolean> {
  const active = await getActiveToken(userId, "instagram");
  if (!active) return false;

  try {
    // P1-16: access token via Bearer header rather than query string.
    const res = await fetch(`${IG_GRAPH}/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${active.accessToken}` },
    });
    return res.ok;
  } catch (err) {
    console.error("[instagram] deleteComment threw:", err);
    return false;
  }
}

export type { InstagramContent };
