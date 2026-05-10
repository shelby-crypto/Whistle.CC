import { db } from "@/lib/db/supabase";
import { getAuthUser } from "@/lib/supabase/server";

/**
 * Get the current authenticated user's app-level user ID and auth ID.
 *
 * Calls Supabase's auth server (/auth/v1/user) via getAuthUser() to verify
 * the JWT in the session cookie, then looks up the corresponding row in our
 * public.users table.
 *
 * Returns null if:
 *   - the session cookie is missing or malformed
 *   - the access_token is not a valid, non-expired Supabase JWT
 *   - no public.users row exists for the verified auth_id
 *
 * SECURITY NOTE: Earlier versions of this helper trusted the cookie's
 * embedded `user.id` without verifying the JWT signature. That made
 * the session cookie forgeable: any signed-in user could overwrite their
 * own cookie with a victim's auth_id and impersonate them. The fix is to
 * always go through `supabase.auth.getUser()`, which posts the JWT to
 * Supabase and validates the signature server-side. Do NOT revert to
 * parsing `session.user.id` directly out of the cookie.
 *
 * Used in API routes and Server Components to identify the caller.
 */
export async function getCurrentUser(): Promise<{
  id: string;       // public.users.id (UUID) — used as FK everywhere
  authId: string;   // auth.users.id (UUID) — Supabase Auth identity
  email: string | null;
} | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const { data: user, error } = await db
    .from("users")
    .select("id, email")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  if (error || !user) return null;

  return {
    id: user.id,
    authId: authUser.id,
    email: user.email ?? authUser.email ?? null,
  };
}
