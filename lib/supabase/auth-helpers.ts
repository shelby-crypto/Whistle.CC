import { cookies } from "next/headers";
import { db } from "@/lib/db/supabase";

/**
 * Get the current authenticated user's app-level user ID and auth ID.
 *
 * Reads the Supabase Auth session from cookies, then looks up the
 * corresponding row in our public.users table.
 *
 * Returns null if not authenticated or if no user row exists.
 *
 * Used in API routes and Server Components to replace the old
 * NextAuth `auth()` call.
 */
export async function getCurrentUser(): Promise<{
  id: string;       // public.users.id (UUID) — used as FK everywhere
  authId: string;   // auth.users.id (UUID) — Supabase Auth identity
  email: string | null;
} | null> {
  try {
    const cookieStore = await cookies();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;

    const sessionCookie = cookieStore.get(cookieName)?.value;
    if (!sessionCookie) return null;

    const session = JSON.parse(sessionCookie);
    if (!session?.access_token) return null;

    // Extract the user ID from the session
    const authId = session.user?.id;
    if (!authId) return null;

    // Look up the app user row
    const { data: user } = await db
      .from("users")
      .select("id, email")
      .eq("auth_id", authId)
      .maybeSingle();

    if (!user) return null;

    return {
      id: user.id,
      authId,
      email: user.email,
    };
  } catch {
    return null;
  }
}
