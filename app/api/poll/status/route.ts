import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // P1-20: previously the supabase error was discarded, so a real DB failure
  // was indistinguishable from "no row yet". Surface the error as a 500.
  const { data, error } = await db
    .from("poll_status")
    .select("last_poll_at, last_result, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/poll/status] supabase error:", error);
    return NextResponse.json(
      { error: "Failed to fetch poll status" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ lastPollAt: null, lastResult: null });
  }

  return NextResponse.json({
    lastPollAt: data.last_poll_at,
    lastResult: data.last_result,
    updatedAt: data.updated_at,
  });
}
