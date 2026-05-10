import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";
// P1-22: opt every mutating/state-bearing API route out of static
// optimization and onto the Node runtime so writes are never cached or
// silently routed to the edge runtime where the Supabase client misbehaves.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWLIST_LIMIT = 500;

// ── GET /api/allowlist ───────────────────────────────────────────────────────
// Returns all allowlisted authors for the current user, plus count/limit info.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await db
    .from("allowlisted_authors")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    entries: data ?? [],
    count: data?.length ?? 0,
    limit: ALLOWLIST_LIMIT,
  });
}

// ── POST /api/allowlist ──────────────────────────────────────────────────────
// Add a single author to the allowlist.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { platform, platform_username, platform_user_id, note } = body;

  // Validate required fields
  if (!platform || !platform_username) {
    return NextResponse.json(
      { error: "platform and platform_username are required" },
      { status: 400 }
    );
  }

  if (!["twitter", "instagram"].includes(platform)) {
    return NextResponse.json(
      { error: "platform must be 'twitter' or 'instagram'" },
      { status: 400 }
    );
  }

  // Check current count against cap
  const { count, error: countError } = await db
    .from("allowlisted_authors")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) >= ALLOWLIST_LIMIT) {
    return NextResponse.json(
      { error: `Allowlist limit of ${ALLOWLIST_LIMIT} entries reached` },
      { status: 409 }
    );
  }

  // Normalize username (strip leading @)
  const normalizedUsername = platform_username.replace(/^@/, "");

  const { data, error } = await db
    .from("allowlisted_authors")
    .insert({
      user_id: user.id,
      platform,
      platform_username: normalizedUsername,
      platform_user_id: platform_user_id || null,
      note: note || null,
      added_by: user.email,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This account is already on your allowlist" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
