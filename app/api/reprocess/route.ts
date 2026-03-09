import { NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { runPipeline } from "@/lib/agents/pipeline";
import { isPipelineError } from "@/lib/agents/types";
import type { ActionAgentOutput } from "@/lib/agents/types";
import { normalizeContent } from "@/lib/platforms/normalizer";

export const maxDuration = 60; // Allow up to 60s for reprocessing

export async function POST() {
  try {
    // Find all content items where the pipeline defaulted to "none" / "log"
    // These are items that were processed when the API was unavailable
    const { data: failedItems, error: fetchError } = await db
      .from("pipeline_runs")
      .select(`
        id,
        content_item_id,
        user_id,
        final_risk_level,
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
      .eq("final_risk_level", "none")
      .eq("stages_completed", "{}"); // Empty stages = classifier never ran

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch items", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!failedItems || failedItems.length === 0) {
      // Also try items where stages_completed is null or action_agent has an error
      const { data: failedItems2, error: fetchError2 } = await db
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
        .eq("final_risk_level", "none");

      if (fetchError2 || !failedItems2 || failedItems2.length === 0) {
        return NextResponse.json({
          message: "No failed items found to reprocess",
          items_checked: 0,
          items_reprocessed: 0,
        });
      }

      // Use these items instead
      return await reprocessItems(failedItems2);
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
      direction: contentItem.direction ?? "inbound",
      reach: contentItem.reach ?? "low",
      velocity: contentItem.velocity ?? "normal",
    };

    try {
      console.log(`[reprocess] Re-running pipeline on ${contentItem.external_id}: "${content.slice(0, 80)}..."`);

      const pipelineResult = await runPipeline(content, context);
      const actionOutput = pipelineResult.actionAgent;
      const isError = isPipelineError(actionOutput);

      const newRiskLevel = isError ? "none" : (actionOutput as ActionAgentOutput).final_risk_level;
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

      results.push({
        external_id: contentItem.external_id,
        content_preview: content.slice(0, 80),
        old_risk: "none",
        new_risk: newRiskLevel,
        status: isError ? `pipeline_error: ${JSON.stringify(actionOutput)}` : "success",
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
