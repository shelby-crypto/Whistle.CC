import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { revokeToken } from "@/lib/platforms/token-service";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = (await req.json()) as { platform?: string };
  if (!platform || !["twitter", "instagram"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  await revokeToken(session.user.id, platform);
  return NextResponse.json({ ok: true });
}
