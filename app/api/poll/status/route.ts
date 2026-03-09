import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await db
    .from("poll_status")
    .select("last_poll_at, last_result, updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ lastPollAt: null, lastResult: null });
  }

  return NextResponse.json({
    lastPollAt: data.last_poll_at,
    lastResult: data.last_result,
    updatedAt: data.updated_at,
  });
}
