import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json([], { status: 401 });
  }

  const { data } = await db
    .from("platform_tokens")
    .select("platform, platform_username, status, updated_at")
    .eq("user_id", user.id);

  return NextResponse.json(data ?? []);
}
