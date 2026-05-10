import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/auth";
import { getAuthUser } from "@/lib/supabase/server";

/**
 * NextAuth route handler with a Supabase-auth gate.
 *
 * NextAuth in this app exists ONLY to drive the platform OAuth grant flow
 * (Twitter / Instagram). It is not the identity source — Supabase Auth is.
 * To enforce that, this wrapper requires an authenticated Supabase session
 * on every NextAuth path EXCEPT the OAuth callback (where the user is
 * coming back from the third-party provider — their session cookie should
 * still be present, but we don't hard-block here because the consumeLink-
 * State() call inside the signIn callback already enforces the linkage).
 *
 * Allowed without Supabase auth:
 *   - /api/auth/callback/<provider>   — OAuth provider redirects back here.
 *   - /api/auth/csrf                  — CSRF token used by signIn() client.
 *   - /api/auth/error                 — error page after a failed flow.
 *
 * Everything else (signin, signout, session, providers, etc.) requires a
 * verified Supabase session.
 */
function isUnauthenticatedPath(pathname: string): boolean {
  return (
    /\/api\/auth\/callback(\/|$)/.test(pathname) ||
    /\/api\/auth\/csrf$/.test(pathname) ||
    /\/api\/auth\/error$/.test(pathname)
  );
}

async function gate(
  request: NextRequest,
  inner: (req: NextRequest) => Promise<Response> | Response,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (isUnauthenticatedPath(pathname)) {
    return inner(request);
  }
  const authUser = await getAuthUser();
  if (!authUser) {
    // Bounce through /login so the user re-authenticates with Supabase, then
    // returns to /connect to retry the OAuth flow.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/connect");
    return NextResponse.redirect(loginUrl);
  }
  return inner(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  return gate(request, handlers.GET);
}

export async function POST(request: NextRequest): Promise<Response> {
  return gate(request, handlers.POST);
}
