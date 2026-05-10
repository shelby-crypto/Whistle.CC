import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { revokeToken } from "@/lib/platforms/token-service";
// P1-22: opt every mutating/state-bearing API route out of static
// optimization and onto the Node runtime so writes are never cached or
// silently routed to the edge runtime where the Supabase client misbehaves.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = (await req.json()) as { platform?: string };
  if (!platform || !["twitter", "instagram"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  await revokeToken(user.id, platform);
  return NextResponse.json({ ok: true });
}
