'use client';

/**
 * Login page — Google SSO only, no self-registration.
 */

import { Shield } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

const ERROR_MESSAGES: Record<string, string> = {
  no_access: "You don't have access to this dashboard. Contact your admin if you need it.",
  auth_failed: "We couldn't verify your identity. Try signing in with Google again.",
  no_code: "Authentication was interrupted. Please try again.",
  session_expired: "Your session has expired. Sign in again to continue.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; returnTo?: string };
}) {
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] || 'An error occurred.' : null;

  // CISO Fix: Sanitize returnTo to prevent open redirect attacks
  const sanitizeReturnTo = (value: string | undefined): string => {
    if (!value) return '/';
    if (value.startsWith('/') && !value.startsWith('//') && !value.includes('://')) {
      return value;
    }
    return '/';
  };

  const handleGoogleLogin = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const returnTo = sanitizeReturnTo(searchParams.returnTo);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
        queryParams: {
          hd: undefined, // Could restrict to specific Google Workspace domain
        },
      },
    });
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0B0F1A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      <div style={{
        maxWidth: 400, width: '100%', padding: 40,
        background: '#111827', border: '1px solid #1E293B',
        borderRadius: 16,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Shield size={32} color="#06B6D4" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F1F5F9', margin: '0 0 4px' }}>
            Whistle
          </h1>
          <p style={{ fontSize: 14, color: '#64748B' }}>
            Internal Operations Dashboard
          </p>
        </div>

        {errorMessage && (
          <div style={{
            background: '#7F1D1D20', border: '1px solid #EF444430',
            borderRadius: 8, padding: '12px 16px', marginBottom: 20,
            fontSize: 13, color: '#FCA5A5', lineHeight: 1.5,
          }}>
            {errorMessage}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          style={{
            width: '100%', padding: '12px 20px', borderRadius: 8,
            background: '#1E293B', border: '1px solid #374151',
            color: '#F1F5F9', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10, transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#1A2234';
            e.currentTarget.style.borderColor = '#4B5563';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#1E293B';
            e.currentTarget.style.borderColor = '#374151';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Sign in with Google
        </button>

        <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>
          Access is limited to authorized NetRef Safety employees.
          No self-registration is available.
        </p>
      </div>
    </div>
  );
}
