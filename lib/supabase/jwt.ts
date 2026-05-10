import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Edge-compatible Supabase JWT helpers.
 *
 * These run inside Next.js middleware (Edge runtime) and so cannot use the
 * Supabase JS SDK or the Node `crypto` module. They use `jose` for JWT
 * verification and raw `fetch` for the refresh-token grant.
 *
 * SIGNING-KEY MODEL
 * Supabase has been migrating projects from a single shared HS256 secret
 * to asymmetric per-project signing keys (ES256 / RS256) with rotation.
 * Newer projects publish their public keys at
 *
 *     ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json
 *
 * which exposes both the current signing key and any previous-not-yet-
 * revoked or standby keys, each tagged with a `kid`. We use jose's
 * `createRemoteJWKSet` to pick the right verification key per token —
 * this works for ES256, RS256, AND legacy HS256 (when Supabase exposes
 * the legacy secret as a JWK), so this single code path covers every
 * project state we might encounter.
 *
 * The JWKS fetcher in `jose` caches results per process for the
 * `cacheMaxAge` we pass below, with a `cooldownDuration` between miss
 * refreshes — so we don't hammer Supabase's well-known endpoint on every
 * middleware invocation.
 *
 * No SUPABASE_JWT_SECRET env var is needed.
 */

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (jwksCache) return jwksCache;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      "[jwt] NEXT_PUBLIC_SUPABASE_URL is not set — cannot derive JWKS endpoint",
    );
  }
  jwksCache = createRemoteJWKSet(
    new URL("/auth/v1/.well-known/jwks.json", supabaseUrl),
    {
      // Cache JWKS for 10 minutes; on signature failure, jose will refresh
      // (subject to cooldown) before giving up — that handles the "key
      // rotated mid-request" edge case automatically.
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    },
  );
  return jwksCache;
}

export interface VerifiedAccessToken {
  /** auth.users.id (UUID) — the Supabase Auth identity. */
  sub: string;
  email: string | null;
  /** Standard JWT exp claim (seconds since epoch). */
  exp: number;
}

export type AccessTokenStatus =
  | { kind: "valid"; payload: VerifiedAccessToken }
  | { kind: "expired"; payload: VerifiedAccessToken }
  | { kind: "invalid"; reason: string };

/**
 * Verify the signature on a Supabase access_token and return its payload
 * status. "expired" is distinguished from "invalid" so the caller can
 * attempt a refresh-token swap before redirecting to login.
 *
 * Accepts ES256, RS256, and legacy HS256 — `jose` resolves the right key
 * from the JWKS based on the token's `kid` and `alg` claims.
 */
export async function verifyAccessToken(
  accessToken: string,
): Promise<AccessTokenStatus> {
  if (!accessToken || typeof accessToken !== "string") {
    return { kind: "invalid", reason: "empty_token" };
  }

  let jwks: ReturnType<typeof createRemoteJWKSet>;
  try {
    jwks = getJWKS();
  } catch (err) {
    return {
      kind: "invalid",
      reason: err instanceof Error ? err.message : "jwks_init_failed",
    };
  }

  try {
    const { payload } = await jwtVerify(accessToken, jwks, {
      algorithms: ["ES256", "RS256", "HS256"],
      clockTolerance: "5s",
    });

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email =
      typeof payload.email === "string" && payload.email.length > 0
        ? payload.email
        : null;
    const exp = typeof payload.exp === "number" ? payload.exp : 0;

    if (!sub) {
      return { kind: "invalid", reason: "missing_sub" };
    }

    return { kind: "valid", payload: { sub, email, exp } };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";

    if (code === "ERR_JWT_EXPIRED") {
      // Surface the payload so the refresh path can correlate the user.
      // Decode without verification — safe because we only USE the result
      // if the refresh-token call to Supabase later succeeds.
      try {
        const middle = accessToken.split(".")[1];
        if (middle) {
          const json = JSON.parse(
            atob(middle.replace(/-/g, "+").replace(/_/g, "/")),
          ) as Record<string, unknown>;
          return {
            kind: "expired",
            payload: {
              sub: typeof json.sub === "string" ? json.sub : "",
              email:
                typeof json.email === "string" && json.email.length > 0
                  ? json.email
                  : null,
              exp: typeof json.exp === "number" ? json.exp : 0,
            },
          };
        }
      } catch {
        // fall through
      }
      return { kind: "invalid", reason: "expired_unparseable" };
    }
    return { kind: "invalid", reason: code || "verify_failed" };
  }
}

export interface RefreshedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string | null; phone?: string | null };
}

/**
 * Exchange a refresh_token for a fresh session using Supabase's REST endpoint.
 * Returns null on any failure — the caller should redirect to /login.
 *
 * Edge-runtime safe (uses fetch, no Node crypto). Unaffected by the JWT
 * signing-key model: the refresh endpoint just validates the refresh_token
 * server-side and issues a new access_token signed with whatever key is
 * current for the project.
 */
export async function refreshSession(
  refreshToken: string,
): Promise<RefreshedSession | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("[jwt] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }
  if (!refreshToken) return null;

  try {
    const url = new URL("/auth/v1/token", supabaseUrl);
    url.searchParams.set("grant_type", "refresh_token");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // 4xx = the refresh token is no longer valid (revoked, expired,
      // single-use already consumed). The caller will redirect to login.
      return null;
    }

    const body = (await res.json()) as Partial<RefreshedSession> & {
      user?: { id?: string; email?: string | null; phone?: string | null };
    };

    if (!body.access_token || !body.refresh_token || !body.user?.id) {
      return null;
    }

    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at:
        body.expires_at ??
        Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
      expires_in: body.expires_in ?? 3600,
      token_type: body.token_type ?? "bearer",
      user: {
        id: body.user.id,
        email: body.user.email ?? null,
        phone: body.user.phone ?? null,
      },
    };
  } catch (err) {
    console.error("[jwt] refreshSession threw:", err);
    return null;
  }
}

/**
 * Build the cookie payload string written to `sb-<ref>-auth-token`. The
 * format mirrors what `app/api/auth/set-session` writes so the rest of the
 * app sees a consistent shape.
 */
export function serializeSessionCookie(session: RefreshedSession): string {
  return JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });
}
