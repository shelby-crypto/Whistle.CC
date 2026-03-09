import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client — uses the service role key.
 * Never import this in browser/client components.
 *
 * Single instance shared across all server-side modules.
 */
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
