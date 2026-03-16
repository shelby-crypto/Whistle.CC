import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client that reads the auth session from cookies.
 * Used in Server Components, Server Actions, and Route Handlers.
 *
 * Uses the anon key so RLS policies are enforced per-user.
 * For admin operations that bypass RLS, use `lib/db/supabase.ts` (service role).
 *
 * Must be called fresh per request (cookies() is request-scoped).
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  // Read all Supabase auth cookies (sb-<ref>-auth-token, etc.)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Extract the project ref from the URL (e.g., "aioiykalpxmejbsqzrfy" from "https://aioiykalpxmejbsqzrfy.supabase.co")
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const authCookieName = `sb-${projectRef}-auth-token`;

  // Supabase stores session as a JSON string in a cookie
  const sessionCookie = cookieStore.get(authCookieName)?.value;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        // If we have a session cookie, we'll set the session manually below
      },
    },
  });

  // If there's a stored session, restore it
  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie);
      if (session?.access_token) {
        await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token ?? "",
        });
      }
    } catch {
      // Invalid cookie — will be treated as unauthenticated
    }
  }

  return client;
}

/**
 * Get the current Supabase Auth user from the server context.
 * Returns null if not authenticated.
 */
export async function getAuthUser() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
