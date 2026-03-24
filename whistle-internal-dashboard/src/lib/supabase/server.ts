import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for server-side use (API routes, server components).
 *
 * CISO Finding 1: Session tokens stored in httpOnly, Secure, SameSite=Strict cookies.
 * Never localStorage. The Supabase SSR library handles this when configured correctly.
 */
export function createSupabaseServer() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({
            name,
            value,
            ...options,
            // ═══ CISO FINDING 1: Cookie Security ═══
            httpOnly: true,         // Not accessible via JavaScript
            secure: true,           // HTTPS only
            sameSite: 'strict',     // No cross-site sending
            path: '/',
            // 8-hour max session
            maxAge: (parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10)) * 60 * 60,
          });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    }
  );
}

/**
 * Creates a Supabase client with the service role key.
 * Used ONLY for:
 * - Writing audit log entries
 * - Managing sessions
 * - Admin operations (role management)
 *
 * NEVER expose this to the client.
 */
export function createSupabaseAdmin() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    }
  );
}
