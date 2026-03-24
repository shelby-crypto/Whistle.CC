/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RATE LIMITING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements CISO Finding 5:
 *   - General API routes: 60 requests/minute per user
 *   - Research export endpoint: 5 exports/hour per user
 *   - Case lookup search: 30 searches/minute per user
 *
 * Uses in-memory sliding window. Appropriate for 5-10 users.
 * At scale (50+ users), move to Vercel KV or Redis.
 */

interface RateLimitEntry {
  timestamps: number[];
}

// In-memory store — resets on server restart, which is acceptable
// for an internal tool with <10 users. Replace with Redis/KV at scale.
const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 3600000; // 1 hour ago
  for (const [key, entry] of Array.from(store.entries())) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300000);

export interface RateLimitConfig {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests in that window
}

export const RATE_LIMITS = {
  general: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_GENERAL_PER_MINUTE || '60', 10),
  },
  export: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_EXPORT_PER_HOUR || '5', 10),
  },
  search: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_SEARCH_PER_MINUTE || '30', 10),
  },
} as const;

/**
 * Check if a request should be rate limited.
 *
 * @returns { allowed: true } if the request is within limits,
 *          { allowed: false, retryAfterMs } if rate limited.
 */
export function checkRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig = RATE_LIMITS.general
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => t > windowStart);

  // Check limit
  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
  };
}

/**
 * Create rate limit headers for the response.
 */
export function rateLimitHeaders(
  config: RateLimitConfig,
  remaining: number,
  retryAfterMs?: number
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Window': String(config.windowMs / 1000),
  };

  if (retryAfterMs !== undefined) {
    headers['Retry-After'] = String(Math.ceil(retryAfterMs / 1000));
  }

  return headers;
}
