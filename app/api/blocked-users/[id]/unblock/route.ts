import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";
import { unblockUser } from "@/lib/platforms/twitter-fetcher";

// ── POST /api/blocked-users/[id]/unblock ─────────────────────────────────────
// Reverses a block on the platform and marks the action as reversed.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: actionId } = await params;

  // Fetch the platform action
  const { data: action, error: actionError } = await db
    .from("platform_actions")
    .select("id, platform, external_author_id, pipeline_run_id, reversed")
    .eq("id", actionId)
    .single();

  if (actionError || !action) {
    return NextResponse.json({ error: "Block action not found" }, { status: 404 });
  }

  // Verify ownership through pipeline_run → user_id
  const { data: pipelineRun } = await db
    .from("pipeline_runs")
    .select("user_id")
    .eq("id", action.pipeline_run_id)
    .single();

  if (!pipelineRun || pipelineRun.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (action.reversed) {
    return NextResponse.json(
      { error: "This block has already been reversed" },
      { status: 409 }
    );
  }

  // Platform-specific unblock
  if (action.platform === "twitter") {
    if (!action.external_author_id) {
      return NextResponse.json(
        { error: "No author ID recorded for this block — cannot unblock" },
        { status: 400 }
      );
    }

    const result = await unblockUser(user.id, action.external_author_id);
    if (!result.success) {
      return NextResponse.json(
        { error: `Failed to unblock on Twitter: ${result.error}` },
        { status: 502 }
      );
    }
  } else if (action.platform === "instagram") {
    return NextResponse.json(
      {
        error:
          "Instagram does not support unblocking via API. Please unblock directly in the Instagram app.",
      },
      { status: 422 }
    );
  }

  // Mark the action as reversed
  const { error: updateError } = await db
    .from("platform_actions")
    .update({
      reversed: true,
      reversed_at: new Date().toISOString(),
      reversed_by: user.email,
    })
    .eq("id", actionId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
