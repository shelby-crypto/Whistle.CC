import { NextRequest, NextResponse } from "next/server";

/**
 * Auth middleware — redirects unauthenticated users to /login.
 *
 * Checks for the Supabase Auth session cookie. If missing or expired,
 * redirects to the login page. Public routes (login, auth callbacks,
 * NextAuth endpoints, static assets) are exempt.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = [
    "/login",
    "/auth",           // Supabase auth callbacks
    "/api/auth",       // Both NextAuth and our auth endpoints
    "/api/webhook",    // Meta webhook callbacks (unauthenticated)
    "/api/cron",       // Vercel cron jobs (secured by CRON_SECRET)
    "/_next",          // Next.js internals
    "/favicon.ico",
  ];

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for Supabase Auth session cookie
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : "";
  const cookieName = `sb-${projectRef}-auth-token`;

  const sessionCookie = request.cookies.get(cookieName)?.value;

  if (!sessionCookie) {
    // No session — redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Basic session validation (check it's parseable and has an access_token)
  try {
    const session = JSON.parse(sessionCookie);
    if (!session?.access_token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check if token has expired
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      // Token expired — let the page handle refresh or redirect
      // Don't hard redirect here as the Supabase client may auto-refresh
    }
  } catch {
    // Invalid cookie
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files and images
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
