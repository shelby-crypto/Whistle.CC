/**
 * GET /api/auth/session
 *
 * Returns the current user's session info for the frontend.
 * Used by the session timeout UI (CISO Code Review Finding 4).
 *
 * POST /api/auth/session — Refresh idle timeout (activity heartbeat)
 * DELETE /api/auth/session — Logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email');
  const userRole = request.headers.get('x-user-role');

  if (!userId || !userEmail || !userRole) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Get session details for timeout UI
  const admin = createSupabaseAdmin();
  const { data: sessions } = await admin
    .from('dashboard_sessions')
    .select('id, expires_at, idle_timeout_at, last_activity')
    .eq('user_id', userId)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('last_activity', { ascending: false })
    .limit(1);

  const currentSession = sessions?.[0];

  return NextResponse.json({
    authenticated: true,
    user: {
      id: userId,
      email: userEmail,
      role: userRole,
    },
    session: currentSession ? {
      expiresAt: currentSession.expires_at,
      idleTimeoutAt: currentSession.idle_timeout_at,
      lastActivity: currentSession.last_activity,
    } : null,
  });
}

/**
 * POST: Activity heartbeat — refreshes idle timeout.
 * Called by the frontend every few minutes when the user is active.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const idleTimeoutMs = (parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10)) * 60 * 1000;
  const admin = createSupabaseAdmin();

  await admin
    .from('dashboard_sessions')
    .update({
      last_activity: new Date().toISOString(),
      idle_timeout_at: new Date(Date.now() + idleTimeoutMs).toISOString(),
    })
    .eq('user_id', userId)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString());

  return NextResponse.json({ refreshed: true });
}

/**
 * DELETE: Logout — revoke session and sign out of Supabase Auth.
 */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const userEmail = request.headers.get('x-user-email') || 'unknown';
  const userRole = request.headers.get('x-user-role') || 'unknown';

  if (userId) {
    // Revoke all sessions for this user
    const admin = createSupabaseAdmin();
    await admin
      .from('dashboard_sessions')
      .update({ revoked: true, revoked_by: 'self_logout', revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('revoked', false);

    // Audit log
    await writeAuditLog({
      userEmail,
      userRole,
      action: 'logout',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
    });
  }

  // Sign out of Supabase Auth (clears cookies)
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();

  return NextResponse.json({ loggedOut: true });
}
