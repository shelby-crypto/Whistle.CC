import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/set-session
 *
 * Called from the login page after successful OTP verification.
 * Stores the Supabase Auth session in an HTTP-only cookie so that
 * the server-side middleware and route handlers can read it on
 * subsequent requests.
 *
 * The Supabase browser client stores sessions in localStorage, but
 * Next.js middleware can only read cookies — this endpoint bridges
 * the two.
 *
 * SECURITY: Earlier versions of this route accepted any JSON body
 * and wrote it verbatim into the auth cookie. Combined with the
 * (since-fixed) `getCurrentUser()` helper that didn't verify the
 * embedded JWT, this allowed any signed-in user to impersonate any
 * other user by POSTing a forged session shape from the browser.
 *
 * The route now does two things to defend in depth:
 *   1. It verifies the supplied `access_token` is a real Supabase
 *      JWT by calling `auth.getUser(access_token)` (which validates
 *      the signature server-side at /auth/v1/user).
 *   2. It pins the `user` field of the cookie to the verified
 *      identity, ignoring whatever `user.id` the request claims.
 *
 * Origin/Referer checks remain in place to make CSRF harder.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Origin Validation ───────────────────────────────────────────────
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");

    // Build expected origin from NEXT_PUBLIC_APP_URL, or construct from Host header
    let expectedOrigin = process.env.NEXT_PUBLIC_APP_URL;
    if (!expectedOrigin) {
      const host = request.headers.get("host");
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
      expectedOrigin = host ? `${protocol}://${host}` : "http://localhost:3000";
    }

    // Check that request comes from the same origin
    if (origin && origin !== expectedOrigin) {
      console.warn("[set-session] Origin mismatch:", origin, "vs", expectedOrigin);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (referer) {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== expectedOrigin) {
        console.warn("[set-session] Referer mismatch:", refererOrigin, "vs", expectedOrigin);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const session = await request.json();

    if (!session?.access_token || typeof session.access_token !== "string") {
      return NextResponse.json({ error: "Missing session data" }, { status: 400 });
    }

    // ── JWT Verification ────────────────────────────────────────────────
    // Confirm the access_token is a real Supabase JWT before persisting
    // it. Without this, the route would happily store any string a caller
    // sends — and any future regression in `getCurrentUser()` (or any new
    // code path that reads the cookie directly) would re-introduce the
    // forgeable-cookie vulnerability.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: verified, error: verifyError } =
      await verifyClient.auth.getUser(session.access_token);

    if (verifyError || !verified?.user) {
      // Don't echo the upstream error message — it can leak detail.
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }

    // ── Build Cookie From Verified Identity ────────────────────────────
    // Ignore caller-supplied `user.id` / `user.email` / `user.phone` —
    // they're authoritative only when sourced from the verified JWT.
    const cookiePayload = {
      access_token: session.access_token,
      refresh_token: typeof session.refresh_token === "string" ? session.refresh_token : "",
      expires_at: typeof session.expires_at === "number" ? session.expires_at : undefined,
      expires_in: typeof session.expires_in === "number" ? session.expires_in : undefined,
      token_type: typeof session.token_type === "string" ? session.token_type : "bearer",
      user: {
        id: verified.user.id,
        email: verified.user.email ?? null,
        phone: verified.user.phone ?? null,
      },
    };

    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;

    const response = NextResponse.json({ ok: true });

    response.cookies.set(cookieName, JSON.stringify(cookiePayload), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
