/**
 * Per-user rate limiting backed by Upstash Redis (REST API).
 *
 * P1-13: any signed-in user could previously hit `/api/moderate` in a tight
 * loop and burn the Anthropic budget. We close that hole by capping per-user
 * Anthropic-touching calls at the edge of every relevant API route.
 *
 * Implementation choice: we hit Upstash's REST API directly with `fetch`
 * instead of pulling in `@upstash/ratelimit` + `@upstash/redis`. Two reasons:
 *   1. No new build-time dependency churn — keeps `package.json` minimal.
 *   2. The algorithm we want is a fixed-window counter, which is two Redis
 *      commands (INCR + EXPIRE if first hit). Trivial to express in fetch.
 *
 * Failure mode: if Upstash isn't configured (env vars missing), we fail
 * OPEN and log a warning. That keeps local development frictionless. In
 * production you should treat the absence of these env vars as a deploy
 * blocker — there's a `RATE_LIMIT_REQUIRED=true` escape hatch below to fail
 * closed if you want to enforce that explicitly.
 */

export type RateLimitDecision = {
  ok: boolean;
  /** Remaining calls in this window (pessimistic — includes the just-attempted call). */
  remaining: number;
  /** Window length in seconds (for Retry-After / response headers). */
  windowSeconds: number;
  /** Reason when ok=false — useful for logging. */
  reason?: "limited" | "config_missing" | "upstash_error";
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const FAIL_CLOSED = process.env.RATE_LIMIT_REQUIRED === "true";

/**
 * Atomically increment a fixed-window counter for `userId:key` and decide
 * whether the call is allowed. Window starts at the first call and resets
 * after `windowSeconds`.
 *
 * @param userId  Whistle user ID (NOT the platform-specific external ID).
 * @param key     A short identifier for the limit family (e.g. "moderate").
 * @param limit   Max allowed calls per window.
 * @param windowSeconds  Window length in seconds.
 */
export async function rateLimit(
  userId: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitDecision> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    if (FAIL_CLOSED) {
      console.error(
        "[rate-limit] Upstash not configured and RATE_LIMIT_REQUIRED=true; failing closed"
      );
      return { ok: false, remaining: 0, windowSeconds, reason: "config_missing" };
    }
    console.warn(
      "[rate-limit] Upstash not configured; allowing request (fail-open). " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable enforcement."
    );
    return { ok: true, remaining: limit, windowSeconds };
  }

  // Bucket the window so the key naturally rolls over. This avoids needing
  // to track expiry separately — every window has its own key.
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `rl:${key}:${userId}:${bucket}`;

  try {
    // Pipeline INCR + EXPIRE in one round-trip. Upstash's pipeline endpoint
    // accepts an array-of-arrays where each inner array is [cmd, ...args].
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSeconds)],
      ]),
      // Don't let a stuck Upstash hang the request path. 1.5s is plenty for
      // a single pipelined round-trip; if we time out we fail open below.
      signal: AbortSignal.timeout(1500),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[rate-limit] Upstash returned ${res.status}: ${body.slice(0, 200)}`
      );
      return failOpenOrClosed(limit, windowSeconds);
    }

    const json = (await res.json()) as Array<{ result?: number; error?: string }>;
    const incrResult = json[0];
    if (incrResult?.error || typeof incrResult?.result !== "number") {
      console.error("[rate-limit] Unexpected Upstash response:", json);
      return failOpenOrClosed(limit, windowSeconds);
    }

    const count = incrResult.result;
    const ok = count <= limit;
    const remaining = Math.max(0, limit - count);
    return ok
      ? { ok: true, remaining, windowSeconds }
      : { ok: false, remaining: 0, windowSeconds, reason: "limited" };
  } catch (err) {
    console.error("[rate-limit] Upstash call failed:", err);
    return failOpenOrClosed(limit, windowSeconds);
  }
}

function failOpenOrClosed(
  limit: number,
  windowSeconds: number
): RateLimitDecision {
  if (FAIL_CLOSED) {
    return { ok: false, remaining: 0, windowSeconds, reason: "upstash_error" };
  }
  return { ok: true, remaining: limit, windowSeconds };
}

/**
 * Convenience helper: build the standard 429 response body + Retry-After
 * header from a denied decision. Caller wraps this in NextResponse.json.
 */
export function rateLimitHeaders(decision: RateLimitDecision): {
  body: { error: string; retryAfterSeconds: number };
  status: number;
  headers: Record<string, string>;
} {
  return {
    body: {
      error: "Rate limit exceeded. Please try again later.",
      retryAfterSeconds: decision.windowSeconds,
    },
    status: 429,
    headers: {
      "Retry-After": String(decision.windowSeconds),
    },
  };
}
