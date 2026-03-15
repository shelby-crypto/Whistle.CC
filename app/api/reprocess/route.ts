import { NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { runPipeline } from "@/lib/agents/pipeline";
import { isPipelineError } from "@/lib/agents/types";
import type { ActionAgentOutput } from "@/lib/agents/types";
import { normalizeContent } from "@/lib/platforms/normalizer";

export const maxDuration = 300; // Allow up to 5 min for reprocessing

const BATCH_SIZE = 3; // Process at most 3 items per request to avoid timeouts

export async function POST() {
  try {
    // Find content items where the pipeline genuinely failed:
    // - risk_level = "error" (new format — pipeline explicitly errored)
    // - risk_level = "none" WITH empty stages (legacy format — pipeline never ran)
    // Does NOT re-pick items that were legitimately classified as "none" with completed stages
    const { data: failedItems, error: fetchError } = await db
      .from("pipeline_runs")
      .select(`
        id,
        content_item_id,
        user_id,
        final_risk_level,
        stages_completed,
        content_items!inner (
          id,
          content,
          platform,
          external_id,
          direction,
          reach,
          raw_data
        )
      `)
      .or("final_risk_level.eq.error,and(final_risk_level.eq.none,stages_completed.eq.{})")
      .limit(BATCH_SIZE);

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch items", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!failedItems || failedItems.length === 0) {
      return NextResponse.json({
        message: "No failed items found to reprocess",
        items_checked: 0,
        items_reprocessed: 0,
      });
    }

    return await reprocessItems(failedItems);
  } catch (err) {
    return NextResponse.json(
      { error: "Reprocess failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reprocessItems(items: any[]) {
  const results: Array<{
    external_id: string;
    content_preview: string;
    old_risk: string;
    new_risk: string;
    status: string;
  }> = [];

  for (const item of items) {
    const contentItem = item.content_items;
    const content = contentItem.content;
    const context = {
      direction: contentItem.direction ?? "direct",
      reach: contentItem.reach ?? "medium",
      velocity: contentItem.velocity ?? "moderate",
    };

    try {
      console.log(`[reprocess] Re-running pipeline on ${contentItem.external_id}: "${content.slice(0, 80)}..."`);

      const pipelineResult = await runPipeline(content, context);
      const actionOutput = pipelineResult.actionAgent;
      const isError = isPipelineError(actionOutput);

      // If the pipeline fails again during reprocessing, mark as "failed" (not "error")
      // so the reprocess query won't pick it up again in an infinite loop.
      // "error" items come from the live poller and get ONE reprocess attempt.
      const newRiskLevel = isError ? "failed" : (actionOutput as ActionAgentOutput).final_risk_level;
      const newContentAction = isError ? "log" : (actionOutput as ActionAgentOutput).actions_executed.content_action;
      const newAccountAction = isError ? "none" : (actionOutput as ActionAgentOutput).actions_executed.account_action;
      const newSupplementaryActions = isError ? [] : (actionOutput as ActionAgentOutput).actions_executed.supplementary_actions;

      // Update the existing pipeline run with the new results
      const { error: updateError } = await db
        .from("pipeline_runs")
        .update({
          classifier_output: pipelineResult.classifier,
          fp_checker_output: pipelineResult.fpChecker ?? null,
          action_agent_output: actionOutput,
          stages_completed: pipelineResult.stagesCompleted,
          final_risk_level: newRiskLevel,
          content_action: newContentAction,
          account_action: newAccountAction,
          supplementary_actions: newSupplementaryActions,
          safety_override_applied: pipelineResult.safety_override_applied ?? false,
          duration_ms: pipelineResult.durationMs,
        })
        .eq("id", item.id);

      if (updateError) {
        results.push({
          external_id: contentItem.external_id,
          content_preview: content.slice(0, 80),
          old_risk: "none",
          new_risk: "update_failed",
          status: updateError.message,
        });
        continue;
      }

      // Also update audit log
      await db
        .from("audit_log")
        .update({
          final_risk_level: newRiskLevel,
          content_action: newContentAction,
          account_action: newAccountAction,
          pipeline_stages_completed: pipelineResult.stagesCompleted,
          safety_override_applied: pipelineResult.safety_override_applied ?? false,
        })
        .eq("pipeline_run_id", item.id);

      // Include classifier error details when pipeline fails — the action agent
      // just says "skipped_due_to_classifier_failure" which isn't helpful for debugging
      const classifierError = isPipelineError(pipelineResult.classifier)
        ? pipelineResult.classifier
        : null;

      results.push({
        external_id: contentItem.external_id,
        content_preview: content.slice(0, 80),
        old_risk: item.final_risk_level ?? "none",
        new_risk: newRiskLevel,
        status: isError
          ? `pipeline_error: classifier=${JSON.stringify(classifierError)}, action_agent=${JSON.stringify(actionOutput)}`
          : "success",
      });

      console.log(`[reprocess] ${contentItem.external_id}: none -> ${newRiskLevel}`);
    } catch (err) {
      results.push({
        external_id: contentItem.external_id,
        content_preview: content.slice(0, 80),
        old_risk: "none",
        new_risk: "error",
        status: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    message: `Reprocessed ${results.length} items`,
    items_checked: items.length,
    items_reprocessed: results.filter((r) => r.status === "success").length,
    results,
  });
}
