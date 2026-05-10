import { NextRequest, NextResponse } from "next/server";
import {
  refreshSession,
  serializeSessionCookie,
  verifyAccessToken,
} from "@/lib/supabase/jwt";

/**
 * Auth middleware — verifies Supabase JWTs and refreshes expired sessions.
 *
 * Earlier versions only checked that an `sb-<ref>-auth-token` cookie EXISTED
 * and was JSON-parseable. They never verified the JWT signature, so a
 * forged cookie passed middleware (and pre-P0-1 was then trusted by route
 * handlers). They also noted expiry but did nothing about it, leaving
 * users in a "page loads, then every API call 401s" half-state.
 *
 * The new flow:
 *   1. If the path is public, pass through.
 *   2. If no cookie, redirect to /login (preserving `next`).
 *   3. Parse the cookie (Supabase stores the session as JSON).
 *   4. Verify the access_token signature with SUPABASE_JWT_SECRET via jose.
 *      - If the signature is invalid (forged / tampered), redirect to /login.
 *      - If the token is expired but the cookie has a refresh_token, call
 *        Supabase's `/auth/v1/token?grant_type=refresh_token` and write the
 *        refreshed session back to the cookie before allowing the request
 *        through. If refresh fails, redirect to /login.
 *      - If the token is valid, pass through.
 *
 * Edge runtime: uses jose for HS256 verification and raw fetch for the
 * refresh-token grant. No Node `crypto` and no Supabase JS SDK.
 */

const PUBLIC_PATHS = [
  "/login",
  "/auth",         // Supabase auth callbacks
  "/api/auth",     // NextAuth + our auth endpoints
  "/api/webhook",  // Meta webhook callbacks (signature-verified, unauthenticated)
  "/api/cron",     // Vercel cron jobs (secured by CRON_SECRET)
  "/_next",        // Next.js internals
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

async function authenticateRequest(
  request: NextRequest,
): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl) {
    // Misconfigured deploy — don't lock everyone out, but also don't pretend
    // they're authenticated. Redirect to /login; the login page will surface
    // the env error.
    return redirectToLogin(request);
  }
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  const sessionCookie = request.cookies.get(cookieName)?.value;
  if (!sessionCookie) {
    return redirectToLogin(request);
  }

  // ── Parse the session cookie ────────────────────────────────────────────
  let parsed: { access_token?: string; refresh_token?: string } | null = null;
  try {
    parsed = JSON.parse(sessionCookie);
  } catch {
    // Cookie isn't even JSON — treat as unauthenticated.
    const res = redirectToLogin(request);
    res.cookies.delete(cookieName);
    return res;
  }

  const accessToken = parsed?.access_token ?? "";
  const refreshToken = parsed?.refresh_token ?? "";

  // ── Verify the access_token signature ───────────────────────────────────
  const status = await verifyAccessToken(accessToken);

  if (status.kind === "valid") {
    return NextResponse.next();
  }

  if (status.kind === "expired") {
    // Try to swap the refresh_token for a fresh session.
    if (!refreshToken) {
      const res = redirectToLogin(request);
      res.cookies.delete(cookieName);
      return res;
    }
    const refreshed = await refreshSession(refreshToken);
    if (!refreshed) {
      const res = redirectToLogin(request);
      res.cookies.delete(cookieName);
      return res;
    }
    // Successfully refreshed — write the new session back to the cookie
    // and pass the request through.
    const res = NextResponse.next();
    res.cookies.set(cookieName, serializeSessionCookie(refreshed), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  }

  // status.kind === "invalid" — forged, tampered, or unparseable.
  console.warn(`[middleware] Rejecting auth cookie: ${status.reason}`);
  const res = redirectToLogin(request);
  res.cookies.delete(cookieName);
  return res;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // DEFENSIVE WRAP: any unhandled throw from the auth path (network blip
  // hitting the JWKS endpoint, malformed token surface, env misconfig)
  // would otherwise become MIDDLEWARE_INVOCATION_FAILED — a 500 across
  // the entire site. Degrade to "treat the user as logged out" instead:
  // the login page is public, so it still renders, and the user can re-
  // authenticate. The error is logged so the operator can investigate.
  try {
    return await authenticateRequest(request);
  } catch (err) {
    console.error("[middleware] Unexpected error during auth check:", err);
    return redirectToLogin(request);
  }
}

export const config = {
  // Match all routes except static files and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
