import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { runPipeline } from "@/lib/agents/pipeline";
import type { ContentContext } from "@/lib/agents/types";

// Manual moderation test endpoint — accepts arbitrary text and runs it
// through the full 3-agent pipeline. Returns the complete PipelineResult.
// Protected by session auth — no unauthenticated access.

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, context } = body as {
    text?: string;
    context?: Partial<ContentContext>;
  };

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required field: text" },
      { status: 400 }
    );
  }

  // Apply defaults for any missing context fields
  const resolvedContext: ContentContext = {
    direction: context?.direction ?? "direct",
    reach: context?.reach ?? "medium",
    velocity: context?.velocity ?? "moderate",
  };

  const result = await runPipeline(text.trim(), resolvedContext);

  // Never expose tokens or internal secrets — pipeline result is safe to return
  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
