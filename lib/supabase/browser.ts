import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for use in "use client" components.
 * Uses the public anon key — Row-Level Security filters data per user.
 *
 * Supabase Auth stores the session in cookies automatically when
 * the client is created with default `auth.storage` and `auth.flowType`.
 */
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (browserClient) return browserClient;

  browserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    }
  );

  return browserClient;
}
