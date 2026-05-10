import { jwtVerify } from "jose";

/**
 * Edge-compatible Supabase JWT helpers.
 *
 * These run inside Next.js middleware (Edge runtime) and so cannot use the
 * Supabase JS SDK or the Node `crypto` module. They use `jose` for HS256
 * signature verification and raw `fetch` for the refresh-token grant.
 *
 * SUPABASE_JWT_SECRET is the symmetric secret Supabase uses to sign access
 * tokens. Find it in your Supabase project: Settings → API → "JWT Secret".
 * It is server-only — do NOT prefix with NEXT_PUBLIC.
 */

let cachedSecret: Uint8Array | null = null;
function getJwtSecretBytes(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "[jwt] SUPABASE_JWT_SECRET is not set. " +
        "Find it in Supabase project Settings → API → 'JWT Secret' " +
        "and add it to .env.local + Vercel project env vars.",
    );
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
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
 * Verify the HS256 signature on a Supabase access_token and return its
 * payload status. "expired" is distinguished from "invalid" so the caller
 * can attempt a refresh-token swap before redirecting to login.
 *
 * NOTE: We pass `clockTolerance: "5s"` so a freshly-issued token whose `iat`
 * is a hair in the future (clock skew) still verifies. We do NOT pass
 * `maxTokenAge` because we want expiry to surface as `kind: "expired"`
 * rather than as a thrown error.
 */
export async function verifyAccessToken(
  accessToken: string,
): Promise<AccessTokenStatus> {
  if (!accessToken || typeof accessToken !== "string") {
    return { kind: "invalid", reason: "empty_token" };
  }

  const secretBytes = getJwtSecretBytes();

  try {
    const { payload } = await jwtVerify(accessToken, secretBytes, {
      algorithms: ["HS256"],
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
    // jose throws on signature mismatch, malformed token, or expiry.
    // We want to surface expiry distinctly so the caller can refresh.
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (code === "ERR_JWT_EXPIRED") {
      // Re-decode without verification to surface the payload — needed so
      // the refresh path can correlate the user. `jose` doesn't expose a
      // dedicated "decode without verify" helper for HS256, so we parse
      // the middle segment manually. This is safe because we only USE the
      // result if the refresh-token call to Supabase later succeeds.
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
 * Edge-runtime safe (uses fetch, no Node crypto).
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
