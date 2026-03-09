import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const { data } = await db
    .from("platform_tokens")
    .select("platform, platform_username, status, updated_at")
    .eq("user_id", session.user.id);

  return NextResponse.json(data ?? []);
}
