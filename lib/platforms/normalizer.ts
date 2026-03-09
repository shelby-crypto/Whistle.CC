import type {
  TwitterContent,
  InstagramContent,
  NormalizedContent,
  Direction,
  Reach,
  Velocity,
} from "@/lib/agents/types";

// ── computeReach ───────────────────────────────────────────────────────────

export function computeReach(metrics: {
  replyCount: number;
  retweetCount: number;
  likeCount: number;
}): Reach {
  const total = metrics.replyCount + metrics.retweetCount + metrics.likeCount;
  if (total >= 100) return "high";
  if (total >= 10) return "medium";
  return "low";
}

// ── computeVelocity ────────────────────────────────────────────────────────

export function computeVelocity(createdAt: string): Velocity {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 6) return "critical";
  if (hours < 12) return "fast";
  if (hours < 24) return "moderate";
  return "slow";
}

// ── normalizeContent ───────────────────────────────────────────────────────

export function normalizeContent(
  raw: TwitterContent | InstagramContent
): NormalizedContent {
  if (raw.platform === "twitter") {
    return {
      platform: "twitter",
      externalId: raw.id,
      text: raw.text,
      authorHandle: raw.authorUsername,
      direction: "direct" as Direction,
      reach: computeReach(raw.metrics),
      velocity: computeVelocity(raw.createdAt),
      rawData: {
        id: raw.id,
        authorId: raw.authorId,
        conversationId: raw.conversationId,
        metrics: raw.metrics,
        createdAt: raw.createdAt,
      },
    };
  }

  return {
    platform: "instagram",
    externalId: raw.id,
    text: raw.text,
    authorHandle: raw.authorUsername,
    direction: "direct" as Direction,
    reach: "medium" as Reach,
    velocity: computeVelocity(raw.createdAt),
    rawData: {
      id: raw.id,
      mediaId: (raw as InstagramContent).mediaId,
      createdAt: raw.createdAt,
    },
  };
}
