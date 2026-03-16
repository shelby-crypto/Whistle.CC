import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";

/**
 * POST /api/auth/ensure-user
 *
 * Called after Supabase Auth OTP verification to ensure the authenticated
 * user has a corresponding row in our public.users table.
 *
 * This uses the service-role client (bypasses RLS) because the user
 * might not have a row yet (chicken-and-egg problem with RLS).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { auth_id, identifier } = body;

    if (!auth_id) {
      return NextResponse.json({ error: "Missing auth_id" }, { status: 400 });
    }

    // Check if user row already exists
    const { data: existing } = await db
      .from("users")
      .select("id")
      .eq("auth_id", auth_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ user_id: existing.id, created: false });
    }

    // Create a new user row linked to this Supabase Auth user
    const { data: newUser, error: insertError } = await db
      .from("users")
      .insert({
        auth_id,
        email: identifier,
        name: null,
      })
      .select("id")
      .single();

    if (insertError) {
      // Could be a race condition — another request created it first
      // Try to fetch again
      const { data: raced } = await db
        .from("users")
        .select("id")
        .eq("auth_id", auth_id)
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
