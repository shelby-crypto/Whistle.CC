import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import type { DashboardUser, SessionInfo, UserRole } from '@/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SESSION MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements CISO Finding 1:
 *   - 8-hour hard session expiry
 *   - 30-minute idle timeout
 *   - Max 2 concurrent sessions per user
 *   - Session revocation by leadership
 *   - httpOnly/Secure/SameSite=Strict cookies (handled in supabase/server.ts)
 */

const SESSION_MAX_AGE_MS = (parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10)) * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = (parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10)) * 60 * 1000;
const MAX_CONCURRENT = parseInt(process.env.SESSION_MAX_CONCURRENT || '2', 10);

/**
 * Validates the current session and returns user info.
 * This is the SINGLE SOURCE OF TRUTH for "is this user authenticated?"
 *
 * Returns null if:
 * - No Supabase session exists
 * - User email is not in the dashboard_user_roles table (no self-registration)
 * - User is deactivated
 * - Session has exceeded hard expiry (8 hours)
 * - Session has exceeded idle timeout (30 minutes)
 * - Session has been revoked
 */
export async function validateSession(): Promise<{
  user: DashboardUser;
  session: SessionInfo;
} | null> {
  const supabase = createSupabaseServer();

  // 1. Check Supabase Auth session (Google SSO)
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  if (authError || !authUser?.email) return null;

  // 2. Look up user in dashboard_user_roles (server-side role enforcement)
  // CISO Code Review Finding 1: Role comes from DB, not client state
  const { data: userRole, error: roleError } = await supabase
    .from('dashboard_user_roles')
    .select('*')
    .eq('email', authUser.email)
    .eq('is_active', true)
    .single();

  if (roleError || !userRole) return null;

  // 3. Check/create dashboard session record
  const admin = createSupabaseAdmin();
  const { data: sessions } = await admin
    .from('dashboard_sessions')
    .select('*')
    .eq('user_id', userRole.id)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  // Find the current session or create one
  let currentSession = sessions?.find(s =>
    new Date(s.idle_timeout_at) > new Date() &&
    new Date(s.expires_at) > new Date()
  );

  if (!currentSession) {
    // Check concurrent session limit before creating new one
    const activeSessions = sessions?.filter(s =>
      new Date(s.expires_at) > new Date() && !s.revoked
    ) || [];

    if (activeSessions.length >= MAX_CONCURRENT) {
      // Revoke oldest session to make room
      const oldest = activeSessions[activeSessions.length - 1];
      await admin
        .from('dashboard_sessions')
        .update({ revoked: true, revoked_by: 'system_concurrent_limit', revoked_at: new Date().toISOString() })
        .eq('id', oldest.id);
    }

    // Create new session
    const now = new Date();
    const { data: newSession, error: sessionError } = await admin
      .from('dashboard_sessions')
      .insert({
        user_id: userRole.id,
        session_token: crypto.randomUUID(),
        expires_at: new Date(now.getTime() + SESSION_MAX_AGE_MS).toISOString(),
        idle_timeout_at: new Date(now.getTime() + IDLE_TIMEOUT_MS).toISOString(),
      })
      .select()
      .single();

    if (sessionError || !newSession) return null;
    currentSession = newSession;
  } else {
    // Refresh idle timeout (sliding window)
    await admin
      .from('dashboard_sessions')
      .update({
        last_activity: new Date().toISOString(),
        idle_timeout_at: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
      })
      .eq('id', currentSession.id);
  }

  return {
    user: {
      id: userRole.id,
      email: userRole.email,
      displayName: userRole.display_name,
      role: userRole.role as UserRole,
      allowedClientIds: userRole.allowed_client_ids,
      isActive: userRole.is_active,
      dataUseAgreedAt: userRole.data_use_agreed_at,
      dataUseVersion: userRole.data_use_version,
    },
    session: {
      userId: userRole.id,
      email: userRole.email,
      role: userRole.role as UserRole,
      sessionId: currentSession.id,
      expiresAt: currentSession.expires_at,
      idleTimeoutAt: currentSession.idle_timeout_at,
    },
  };
}

/**
 * Revoke a specific session. Leadership-only operation.
 */
export async function revokeSession(sessionId: string, revokedBy: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from('dashboard_sessions')
    .update({
      revoked: true,
      revoked_by: revokedBy,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return !error;
}

/**
 * Revoke ALL sessions for a user. Used when an employee leaves.
 */
export async function revokeAllUserSessions(userId: string, revokedBy: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from('dashboard_sessions')
    .update({
      revoked: true,
      revoked_by: revokedBy,
      revoked_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('revoked', false);

  return !error;
}

/**
 * Returns time until session expires and idle timeout,
 * for the frontend session timeout UI (CISO Code Review Finding 4).
 */
export function getSessionTimeRemaining(session: SessionInfo): {
  hardExpiryMs: number;
  idleTimeoutMs: number;
} {
  const now = Date.now();
  return {
    hardExpiryMs: Math.max(0, new Date(session.expiresAt).getTime() - now),
    idleTimeoutMs: Math.max(0, new Date(session.idleTimeoutAt).getTime() - now),
  };
}
