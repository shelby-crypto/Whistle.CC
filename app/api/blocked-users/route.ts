import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

// ── GET /api/blocked-users ───────────────────────────────────────────────────
// Returns all users blocked by Whistle for the current user.
// Joins platform_actions → pipeline_runs → content_items for full context.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all block actions for this user's pipeline runs
  const { data: blockActions, error: actionsError } = await db
    .from("platform_actions")
    .select(`
      id,
      platform,
      external_author_id,
      executed_at,
      reversed,
      reversed_at,
      reversed_by,
      pipeline_run_id
    `)
    .eq("action_type", "block_sender")
    .eq("success", true)
    .order("executed_at", { ascending: false });

  if (actionsError) {
    return NextResponse.json({ error: actionsError.message }, { status: 500 });
  }

  if (!blockActions?.length) {
    return NextResponse.json([]);
  }

  // Fetch associated pipeline runs for context
  const pipelineRunIds = blockActions
    .map((a) => a.pipeline_run_id)
    .filter(Boolean);

  const { data: pipelineRuns } = await db
    .from("pipeline_runs")
    .select(`
      id,
      final_risk_level,
      action_agent_output,
      content_item_id,
      user_id
    `)
    .in("id", pipelineRunIds);

  // Filter to only this user's pipeline runs
  const userPipelineRuns = (pipelineRuns ?? []).filter(
    (pr) => pr.user_id === user.id
  );
  const userPipelineRunIds = new Set(userPipelineRuns.map((pr) => pr.id));

  // Fetch content items for context
  const contentItemIds = userPipelineRuns
    .map((pr) => pr.content_item_id)
    .filter(Boolean);

  const { data: contentItems } = await db
    .from("content_items")
    .select("id, content, author_handle")
    .in("id", contentItemIds);

  // Build lookup maps
  const pipelineRunMap = new Map(userPipelineRuns.map((pr) => [pr.id, pr]));
  const contentItemMap = new Map((contentItems ?? []).map((ci) => [ci.id, ci]));

  // Assemble response — only include blocks from this user's runs
  const blockedUsers = blockActions
    .filter((action) => userPipelineRunIds.has(action.pipeline_run_id))
    .map((action) => {
      const pipelineRun = pipelineRunMap.get(action.pipeline_run_id);
      const contentItem = pipelineRun?.content_item_id
        ? contentItemMap.get(pipelineRun.content_item_id)
        : null;

      const actionOutput = pipelineRun?.action_agent_output as Record<string, unknown> | null;

      return {
        id: action.id,
        platform: action.platform,
        author_id: action.external_author_id,
        author_handle: contentItem?.author_handle ?? null,
        blocked_at: action.executed_at,
        reason: actionOutput?.action_basis ?? "No reason recorded",
        risk_level: pipelineRun?.final_risk_level ?? "unknown",
        triggering_content: contentItem?.content ?? null,
        reversed: action.reversed ?? false,
        reversed_at: action.reversed_at,
        reversed_by: action.reversed_by,
      };
    });

  return NextResponse.json(blockedUsers);
}
