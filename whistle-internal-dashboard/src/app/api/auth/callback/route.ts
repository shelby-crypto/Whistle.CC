/**
 * GET /api/auth/callback
 *
 * Handles the OAuth callback from Google SSO via Supabase Auth.
 * After successful auth, creates a dashboard session record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

/**
 * CISO Fix: Prevent open redirect attacks via returnTo parameter.
 * Only allows relative paths — no protocol prefixes, no double slashes.
 */
function sanitizeReturnTo(returnTo: string | null): string {
  if (!returnTo) return '/';
  if (returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('://')) {
    return returnTo;
  }
  return '/';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', origin));
  }

  const supabase = createSupabaseServer();

  // Exchange the code for a session
  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session?.user?.email) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin));
  }

  // Verify user is in the dashboard_user_roles table
  const { data: userRole } = await supabase
    .from('dashboard_user_roles')
    .select('id, role, is_active')
    .eq('email', session.user.email)
    .single();

  if (!userRole || !userRole.is_active) {
    // Authenticated via Google but no dashboard access
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=no_access', origin));
  }

  // Log the login
  await writeAuditLog({
    userEmail: session.user.email,
    userRole: userRole.role,
    action: 'login',
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  });

  // Redirect to the appropriate default view based on role
  const defaultRoutes: Record<string, string> = {
    ops: '/ops',
    client_success: '/metrics/customers',
    leadership: '/ops',
    research: '/research',
  };

  const destination = returnTo !== '/' ? returnTo : (defaultRoutes[userRole.role] || '/ops');
  return NextResponse.redirect(new URL(destination, origin));
}
