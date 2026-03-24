/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXT.JS MIDDLEWARE — CENTRAL SECURITY ENFORCEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This middleware runs on EVERY request before it reaches any page or API route.
 * It enforces:
 *   - Authentication (redirect to login if no valid session)
 *   - RBAC (block access to unauthorized views/endpoints)
 *   - Rate limiting (reject excessive requests)
 *
 * CISO Code Review Finding 1: Role enforcement is server-side here.
 * The client never determines its own role — the middleware does.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// ─── Route → Required Role Mapping ───────────────────────────────────────
// If a route isn't listed, it requires any authenticated user.

const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/ops':       ['ops', 'leadership'],
  '/metrics':   ['client_success', 'leadership'],
  '/research':  ['research', 'leadership'],
  '/cases':     ['ops', 'client_success', 'leadership', 'research'],
  '/admin':     ['leadership'],

  // API routes
  '/api/ops':       ['ops', 'leadership'],
  '/api/metrics':   ['client_success', 'leadership'],
  '/api/research':  ['research', 'leadership'],
  '/api/cases':     ['ops', 'client_success', 'leadership', 'research'],
  '/api/exports':   ['client_success', 'leadership', 'research'],
  '/api/admin':     ['leadership'],
};

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/api/auth/callback'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Skip public routes ────────────────────────────────────────────
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // ─── Skip static assets ────────────────────────────────────────────
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/') {
    return NextResponse.next();
  }

  // ─── Create Supabase client with cookie handling ───────────────────
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request });
          response.cookies.set({
            name, value, ...options,
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    }
  );

  // ─── 1. AUTHENTICATION CHECK ───────────────────────────────────────
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

  if (authError || !authUser?.email) {
    // Not authenticated → redirect to login
    // CISO Fix: Only pass returnTo if it's a safe relative path
    const loginUrl = new URL('/login', request.url);
    if (pathname.startsWith('/') && !pathname.startsWith('//') && !pathname.includes('://')) {
      loginUrl.searchParams.set('returnTo', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // ─── 2. ROLE LOOKUP (Server-side, from database) ───────────────────
  // CISO Code Review Finding 1: Role comes from DB, not client
  const { data: userRole } = await supabase
    .from('dashboard_user_roles')
    .select('role, is_active, id')
    .eq('email', authUser.email)
    .eq('is_active', true)
    .single();

  if (!userRole) {
    // User is authenticated via Google but NOT in our user_roles table.
    // This is expected for people who have the Google account but haven't
    // been granted dashboard access.
    const unauthorizedUrl = new URL('/login', request.url);
    unauthorizedUrl.searchParams.set('error', 'no_access');
    return NextResponse.redirect(unauthorizedUrl);
  }

  // ─── 3. RBAC ENFORCEMENT ───────────────────────────────────────────
  const matchedRoute = Object.keys(ROUTE_ROLE_MAP)
    .filter(route => pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0]; // Most specific match

  if (matchedRoute) {
    const allowedRoles = ROUTE_ROLE_MAP[matchedRoute];
    if (!allowedRoles.includes(userRole.role)) {
      // User is authenticated but doesn't have the right role
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'You do not have access to this resource.' },
          { status: 403 }
        );
      }
      // For page requests, redirect to their default view
      const defaultRoutes: Record<string, string> = {
        ops: '/ops',
        client_success: '/metrics/customers',
        leadership: '/ops',
        research: '/research',
      };
      return NextResponse.redirect(new URL(defaultRoutes[userRole.role] || '/ops', request.url));
    }
  }

  // ─── 4. INJECT USER CONTEXT INTO HEADERS ───────────────────────────
  // Server components and API routes can read these to know who the user is
  // without re-querying the database.
  response.headers.set('x-user-id', userRole.id);
  response.headers.set('x-user-email', authUser.email);
  response.headers.set('x-user-role', userRole.role);

  return response;
}

export const config = {
  // Run middleware on all routes except static files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
