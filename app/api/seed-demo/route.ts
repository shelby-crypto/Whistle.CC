import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";
import { runPipeline } from "@/lib/agents/pipeline";
import { isPipelineError } from "@/lib/agents/types";
import type { ActionAgentOutput } from "@/lib/agents/types";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// Realistic demo mentions a sports referee (@ShelbyAPerkins / NetRef Safety)
// might receive — spanning the full severity spectrum so the Feed demo is compelling.
const DEMO_MENTIONS = [
  {
    id: "demo_1001",
    text: "@ShelbyAPerkins Great call on that offsides in the 2nd half — you were absolutely right and everyone who watched the replay agrees. Keep up the great work!",
    authorUsername: "CoachDaveH",
    authorId: "demo_author_1",
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1hr ago
    metrics: { replyCount: 2, retweetCount: 5, likeCount: 41 },
  },
  {
    id: "demo_1002",
    text: "@ShelbyAPerkins that penalty in the 3rd quarter was honestly a bad call. Replay clearly shows the player got the ball first. Just saying.",
    authorUsername: "SportsWatcher99",
    authorId: "demo_author_2",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2hr ago
    metrics: { replyCount: 0, retweetCount: 1, likeCount: 3 },
  },
  {
    id: "demo_1003",
    text: "@ShelbyAPerkins absolute WORST officiating I have seen all season. You should not be allowed anywhere near a court. Complete joke of a referee.",
    authorUsername: "AngryFan_Riordan",
    authorId: "demo_author_3",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3hr ago
    metrics: { replyCount: 4, retweetCount: 12, likeCount: 67 },
  },
  {
    id: "demo_1004",
    text: "@ShelbyAPerkins you rigged that game you corrupt piece of garbage. Everyone knows you were paid off. You'll get what's coming to you, I promise you that.",
    authorUsername: "ThreatAccount_X7",
    authorId: "demo_author_4",
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30min ago
    metrics: { replyCount: 1, retweetCount: 0, likeCount: 2 },
  },
  {
    id: "demo_1005",
    text: "hey everyone make sure to @ @ShelbyAPerkins and let them know what you think of crooked officials like this. report the account too while you're at it",
    authorUsername: "CoordHarass_Real",
    authorId: "demo_author_5",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45min ago
    metrics: { replyCount: 8, retweetCount: 23, likeCount: 15 },
  },
  {
    id: "demo_1006",
    text: "@ShelbyAPerkins loved seeing you officiate tonight! My kid wants to be a referee just like you someday 🏀",
    authorUsername: "BasketballMom_Tricia",
    authorId: "demo_author_6",
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5hr ago
    metrics: { replyCount: 0, retweetCount: 0, likeCount: 18 },
  },
  {
    id: "demo_1007",
    text: "@ShelbyAPerkins I know where you park your car after games. You better start calling things fair or there will be consequences. I'm not joking.",
    authorUsername: "StalkThreat_Anon",
    authorId: "demo_author_7",
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15min ago
    metrics: { replyCount: 0, retweetCount: 0, likeCount: 1 },
  },
];

// P1-15: seal seed-demo in production. The route writes synthetic harassment
// data through the full pipeline and burns Anthropic budget; it has no place
// on a customer-facing deploy. Opt back in for an internal demo by setting
// ALLOW_SEED_DEMO=true on the relevant Vercel environment.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_SEED_DEMO !== "true"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // P1-13: seed-demo runs the full pipeline against ~7 fixtures per call,
  // so it has the highest per-call Anthropic cost of the three protected
  // routes. Tighter limit than /moderate.
  const decision = await rateLimit(user.id, "seed-demo", 10, 60 * 60);
  if (!decision.ok) {
    const { body, status, headers } = rateLimitHeaders(decision);
    return NextResponse.json(body, { status, headers });
  }

  const userId = user.id;
  const results: Array<{ id: string; status: string; riskLevel?: string }> = [];

  for (const mention of DEMO_MENTIONS) {
    // Skip if already seeded
    const { data: existing } = await db
      .from("content_items")
      .select("id")
      .eq("platform", "twitter")
      .eq("external_id", mention.id)
      .maybeSingle();

    if (existing) {
      results.push({ id: mention.id, status: "skipped (already exists)" });
      continue;
    }

    // Compute reach & velocity inline (mirrors normalizer logic)
    const total = mention.metrics.replyCount + mention.metrics.retweetCount + mention.metrics.likeCount;
    const reach = total >= 100 ? "high" : total >= 10 ? "medium" : "low";
    const ageHours = (Date.now() - new Date(mention.createdAt).getTime()) / (1000 * 60 * 60);
    const velocity = ageHours < 6 ? "critical" : ageHours < 12 ? "fast" : ageHours < 24 ? "moderate" : "slow";

    // Insert content item
    const { data: contentItem, error: contentError } = await db
      .from("content_items")
      .insert({
        user_id: userId,
        platform: "twitter",
        external_id: mention.id,
        content: mention.text,
        author_handle: mention.authorUsername,
        direction: "direct",
        reach,
        velocity,
        raw_data: {
          authorId: mention.authorId,
          conversationId: mention.id,
          metrics: mention.metrics,
          createdAt: mention.createdAt,
        },
        ingested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (contentError || !contentItem) {
      results.push({ id: mention.id, status: `error: ${contentError?.message}` });
      continue;
    }

    // Run AI pipeline
    let pipelineResult;
    try {
      pipelineResult = await runPipeline(mention.text, { direction: "direct", reach, velocity });
    } catch (err) {
      results.push({ id: mention.id, status: `pipeline error: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    const actionOutput = pipelineResult.actionAgent;
    const isActionError = isPipelineError(actionOutput);
    const finalRiskLevel = isActionError ? "none" : (actionOutput as ActionAgentOutput).final_risk_level;
    const contentAction = isActionError ? "log" : (actionOutput as ActionAgentOutput).actions_executed.content_action;
    const accountAction = isActionError ? "none" : (actionOutput as ActionAgentOutput).actions_executed.account_action;
    const supplementaryActions = isActionError ? [] : (actionOutput as ActionAgentOutput).actions_executed.supplementary_actions;

    // Insert pipeline run
    const { data: pipelineRun, error: runError } = await db
      .from("pipeline_runs")
      .insert({
        content_item_id: contentItem.id,
        user_id: userId,
        classifier_output: pipelineResult.classifier,
        fp_checker_output: pipelineResult.fpChecker ?? null,
        action_agent_output: actionOutput,
        stages_completed: pipelineResult.stagesCompleted,
        final_risk_level: finalRiskLevel,
        content_action: contentAction,
        account_action: accountAction,
        supplementary_actions: supplementaryActions,
        safety_override_applied: pipelineResult.safety_override_applied ?? false,
        duration_ms: pipelineResult.durationMs,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runError || !pipelineRun) {
      results.push({ id: mention.id, status: `pipeline run insert error: ${runError?.message}` });
      continue;
    }

    // Audit log
    await db.from("audit_log").insert({
      pipeline_run_id: pipelineRun.id,
      content_item_id: contentItem.id,
      user_id: userId,
      input_text: mention.text,
      final_risk_level: finalRiskLevel,
      content_action: contentAction,
      account_action: accountAction,
      pipeline_stages_completed: pipelineResult.stagesCompleted,
      irreversible_action_justification: isActionError
        ? null
        : (actionOutput as ActionAgentOutput).irreversible_action_justification,
      safety_override_applied: pipelineResult.safety_override_applied ?? false,
      logged_at: new Date().toISOString(),
    });

    results.push({ id: mention.id, status: "seeded", riskLevel: finalRiskLevel });
    console.log(`[seed-demo] Seeded ${mention.id} → risk=${finalRiskLevel} action=${contentAction}`);
  }

  return NextResponse.json({ ok: true, results });
}
