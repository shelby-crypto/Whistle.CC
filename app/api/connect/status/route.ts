import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // P1-21: was returning `[]` with a 401, which clients couldn't distinguish
    // from "no platforms connected". Use a proper error envelope instead.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await db
    .from("platform_tokens")
    .select("platform, platform_username, status, updated_at")
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/connect/status] supabase error:", error);
    return NextResponse.json(
      { error: "Failed to fetch connect status" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
