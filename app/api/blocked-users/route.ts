import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── GET /api/blocked-users ───────────────────────────────────────────────────
// Returns all users blocked by Whistle for the current user.
// Joins platform_actions → pipeline_runs → content_items for full context.

// P1-18: bound the pipeline_runs scan and chunk subsequent .in() lookups.
// Without these, a user with thousands of historical runs would attempt to
// load the entire history and pass an unbounded list into the IN clause —
// Postgres has no hard ceiling but Supabase rejects URLs over a few KB.
const PIPELINE_RUN_LIMIT = 1000;
const IN_BATCH_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all block actions for this user's pipeline runs
  // First fetch the user's pipeline runs with full context
  const { data: userPipelineRuns, error: pipelineRunsError } = await db
    .from("pipeline_runs")
    .select(`
      id,
      final_risk_level,
      action_agent_output,
      content_item_id,
      created_at
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PIPELINE_RUN_LIMIT);

  if (pipelineRunsError) {
    return NextResponse.json({ error: pipelineRunsError.message }, { status: 500 });
  }

  const userPipelineRunIds = (userPipelineRuns ?? []).map((pr) => pr.id);

  if (userPipelineRunIds.length === 0) {
    return NextResponse.json([]);
  }

  // P1-18: chunk the IN clause so URL length stays bounded even when the
  // user has the maximum number of recent runs.
  type BlockAction = {
    id: string;
    platform: string;
    external_author_id: string | null;
    executed_at: string | null;
    reversed: boolean | null;
    reversed_at: string | null;
    reversed_by: string | null;
    pipeline_run_id: string;
  };
  const blockActions: BlockAction[] = [];
  for (const batch of chunk(userPipelineRunIds, IN_BATCH_SIZE)) {
    const { data, error: actionsError } = await db
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
      .in("pipeline_run_id", batch)
      .order("executed_at", { ascending: false });

    if (actionsError) {
      return NextResponse.json({ error: actionsError.message }, { status: 500 });
    }
    if (data) blockActions.push(...(data as BlockAction[]));
  }
  // Re-sort across batches.
  blockActions.sort((a, b) =>
    (b.executed_at ?? "").localeCompare(a.executed_at ?? "")
  );

  if (!blockActions.length) {
    return NextResponse.json([]);
  }

  // Fetch content items for context
  const contentItemIds = userPipelineRuns
    .map((pr) => pr.content_item_id)
    .filter(Boolean);

  type ContentItem = { id: string; content: string | null; author_handle: string | null };
  const contentItems: ContentItem[] = [];
  for (const batch of chunk(contentItemIds, IN_BATCH_SIZE)) {
    const { data } = await db
      .from("content_items")
      .select("id, content, author_handle")
      .in("id", batch);
    if (data) contentItems.push(...(data as ContentItem[]));
  }

  // Build lookup maps
  const pipelineRunMap = new Map(userPipelineRuns.map((pr) => [pr.id, pr]));
  const contentItemMap = new Map(contentItems.map((ci) => [ci.id, ci]));
  const userPipelineRunIdSet = new Set(userPipelineRunIds);

  // Assemble response — only include blocks from this user's runs
  const blockedUsers = blockActions
    .filter((action) => userPipelineRunIdSet.has(action.pipeline_run_id))
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
