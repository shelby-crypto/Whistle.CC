import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { getAuthUser } from "@/lib/supabase/server";

/**
 * POST /api/auth/ensure-user
 *
 * Called after Supabase Auth OTP verification (and after `/api/auth/set-session`
 * has written the auth cookie) to ensure the authenticated user has a
 * corresponding row in our public.users table.
 *
 * SECURITY: Earlier versions of this endpoint accepted `auth_id` from the
 * request body with no auth check, letting any unauthenticated caller
 * pre-create `users` rows for arbitrary auth IDs (account-pre-claim attack).
 *
 * The route now does two things:
 *   1. Requires a verified Supabase Auth session (via getAuthUser()).
 *   2. Ignores any auth_id supplied in the body and uses the verified
 *      identity instead. The body's `identifier` is still used as the
 *      email, but only when the verified user's email is missing.
 *
 * It still uses the service-role client for the actual insert because the
 * `users` row may not exist yet (chicken-and-egg with RLS).
 */
export async function POST(request: NextRequest) {
  try {
    // Require an authenticated session — this validates the JWT against
    // Supabase's /auth/v1/user endpoint.
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Read the optional identifier (email/phone) from the body. Treat
    // anything else (including a body-supplied auth_id) as untrusted.
    let identifier: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.identifier === "string") {
        identifier = body.identifier;
      }
      // If the request body's auth_id disagrees with the verified user,
      // refuse — it likely indicates a confused or hostile caller.
      if (
        body &&
        typeof body.auth_id === "string" &&
        body.auth_id !== authUser.id
      ) {
        return NextResponse.json(
          { error: "auth_id mismatch" },
          { status: 403 }
        );
      }
    } catch {
      // Body is optional — empty/invalid JSON is fine.
    }

    // Check if user row already exists (keyed off the *verified* auth_id)
    const { data: existing } = await db
      .from("users")
      .select("id")
      .eq("auth_id", authUser.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ user_id: existing.id, created: false });
    }

    // Create a new user row linked to this Supabase Auth user. Prefer the
    // verified email; fall back to the body's identifier only if Supabase
    // Auth didn't have one.
    const email = authUser.email ?? identifier ?? null;

    const { data: newUser, error: insertError } = await db
      .from("users")
      .insert({
        auth_id: authUser.id,
        email,
        name: null,
      })
      .select("id")
      .single();

    if (insertError) {
      // Race: another request created the row first. Refetch.
      const { data: raced } = await db
        .from("users")
        .select("id")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (raced) {
        return NextResponse.json({ user_id: raced.id, created: false });
      }

      console.error("[ensure-user] Insert failed:", insertError.message);
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    return NextResponse.json({ user_id: newUser.id, created: true });
  } catch (err) {
    console.error("[ensure-user] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
