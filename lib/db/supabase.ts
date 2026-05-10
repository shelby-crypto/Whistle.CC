// CRITICAL: this client uses the service-role key and bypasses Row-Level
// Security. The `server-only` import causes Next.js to fail the build if any
// client component tries to import this module — without that guard, a
// single accidental `import { db } from "@/lib/db/supabase"` from a client
// component would bundle SUPABASE_SERVICE_ROLE_KEY into the browser.
import "server-only";

import { createClient } from "@supabase/supabase-js";

// ── Env validation ──────────────────────────────────────────────────────────
// Earlier versions used `process.env.X!`, which silently produces a
// misconfigured client (literal "undefined" URL) in environments where the
// var isn't set, leading to confusing runtime errors deep in DB calls.
// We now fail fast with a clear message.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "[lib/db/supabase] NEXT_PUBLIC_SUPABASE_URL is not set. " +
      "Add it to .env.local (and your Vercel project env vars).",
  );
}
if (!serviceRoleKey) {
  throw new Error(
    "[lib/db/supabase] SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Add it to .env.local (and your Vercel project env vars). " +
      "This key is server-only — never expose it to the browser.",
  );
}

/**
 * Server-side Supabase client — uses the service role key and bypasses RLS.
 *
 * NEVER import in browser/client components. The `import "server-only"` at
 * the top of this file enforces that at build time.
 *
 * Single instance shared across all server-side modules.
 */
export const db = createClient(supabaseUrl, serviceRoleKey);
