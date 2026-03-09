import { db } from "@/lib/db/supabase";
import { fetchMentions, hideTweet, deleteTweet, muteSender, blockSender } from "@/lib/platforms/twitter-fetcher";
import { fetchRecentComments, hideComment, deleteComment } from "@/lib/platforms/instagram-fetcher";
import { normalizeContent } from "@/lib/platforms/normalizer";
import { runPipeline } from "@/lib/agents/pipeline";
import { isPipelineError } from "@/lib/agents/types";
import type { PollResult, ActionAgentOutput } from "@/lib/agents/types";

// ── Retry helper ───────────────────────────────────────────────────────────
// Retries an async operation with exponential backoff. Only retries on errors
// that look transient (network timeouts, 5xx responses). Gives up after
// `maxAttempts` and re-throws the last error.

const RETRYABLE_PATTERNS = [
  /network/i,
  /timeout/i,
  /ECONNRESET/,
  /ENOTFOUND/,
  /fetch failed/i,
  /5\d\d/,             // "503 Service Unavailable" etc.
];

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_PATTERNS.some((re) => re.test(msg));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 500,
    label = "operation",
  }: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) break;
      const delayMs = baseDelayMs * 2 ** (attempt - 1); // 500 → 1000 → 2000
      console.warn(`[poller] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms:`, err);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw lastErr;
}

async function getPollCursor(userId: string, platform: string): Promise<string | null> {
  const { data } = await db
    .from("poll_cursors")
    .select("last_seen_id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  return data?.last_seen_id ?? null;
}

async function setPollCursor(userId: string, platform: string, lastSeenId: string): Promise<void> {
  const { error } = await db.from("poll_cursors").upsert(
    { user_id: userId, platform, last_seen_id: lastSeenId, updated_at: new Date().toISOString() },
    { onConflict: "user_id,platform" }
  );
  if (error) console.error("[poller] setPollCursor failed:", error.message);
}

async function contentExists(platform: string, externalId: string): Promise<boolean> {
  const { data } = await db
    .from("content_items")
    .select("id")
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();
  return !!data;
}

// ── Platform action executor ───────────────────────────────────────────────

async function executePlatformActions(params: {
  userId: string;
  platform: "twitter" | "instagram";
  externalId: string;
  authorId: string | null;
  actionOutput: ActionAgentOutput;
  pipelineRunId: string;
}): Promise<void> {
  const { userId, platform, externalId, authorId, actionOutput, pipelineRunId } = params;
  const { content_action, account_action } = actionOutput.actions_executed;

  // Guard: never call real delete on Instagram without full justification
  const canDelete =
    content_action === "delete" &&
    actionOutput.final_risk_level === "severe" &&
    actionOutput.irreversible_action_justification !== null;

  const actionsToRun: Array<{
    type: string;
    fn: () => Promise<boolean>;
    externalContentId?: string;
    externalAuthorId?: string;
  }> = [];

  // Content action
  if (platform === "twitter") {
    if (content_action === "hide") {
      actionsToRun.push({ type: "hide", fn: () => hideTweet(userId, externalId), externalContentId: externalId });
    } else if (canDelete) {
      actionsToRun.push({ type: "delete", fn: () => deleteTweet(userId, externalId), externalContentId: externalId });
    } else if (content_action === "delete") {
      // Downgrade to hide if irreversibility conditions not met
      actionsToRun.push({ type: "hide_downgraded_from_delete", fn: () => hideTweet(userId, externalId), externalContentId: externalId });
    }
  } else if (platform === "instagram") {
    if (content_action === "hide") {
      actionsToRun.push({ type: "hide", fn: () => hideComment(userId, externalId), externalContentId: externalId });
    } else if (canDelete) {
      actionsToRun.push({ type: "delete", fn: () => deleteComment(userId, externalId), externalContentId: externalId });
    } else if (content_action === "delete") {
      actionsToRun.push({ type: "hide_downgraded_from_delete", fn: () => hideComment(userId, externalId), externalContentId: externalId });
    }
  }

  // Account action (Twitter only — Instagram Graph API does not support mute/block)
  if (authorId && platform === "twitter") {
    if (account_action === "mute_sender") {
      actionsToRun.push({ type: "mute_sender", fn: () => muteSender(userId, authorId), externalAuthorId: authorId });
    } else if (account_action === "block_sender") {
      actionsToRun.push({ type: "block_sender", fn: () => blockSender(userId, authorId), externalAuthorId: authorId });
    }
  }

  // Execute all actions — fire-and-forget, log results to platform_actions
  for (const action of actionsToRun) {
    let success = false;
    let errorMessage: string | null = null;
    try {
      success = await action.fn();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const { error: actionLogError } = await db.from("platform_actions").insert({
      pipeline_run_id: pipelineRunId,
      platform,
      action_type: action.type,
      external_content_id: action.externalContentId ?? null,
      external_author_id: action.externalAuthorId ?? null,
      success,
      error_message: errorMessage,
      executed_at: new Date().toISOString(),
    });
    if (actionLogError) console.error("[poller] platform_actions insert failed:", actionLogError.message);
  }
}

// ── Process a single content item through the full pipeline ───────────────

async function processContentItem(params: {
  userId: string;
  platform: "twitter" | "instagram";
  externalId: string;
  text: string;
  authorHandle: string;
  authorId: string | null;
  createdAt: string;
  rawData: Record<string, unknown>;
  errors: string[];
}): Promise<boolean> {
  const { userId, platform, externalId, text, authorHandle, authorId, createdAt, rawData, errors } = params;

  try {
    const normalized = normalizeContent(
      platform === "twitter"
        ? {
            id: externalId,
            text,
            authorId: authorId ?? "",
            authorUsername: authorHandle,
            createdAt,
            metrics: (rawData.metrics as { replyCount: number; retweetCount: number; likeCount: number }) ??
              { replyCount: 0, retweetCount: 0, likeCount: 0 },
            conversationId: (rawData.conversationId as string) ?? "",
            platform: "twitter",
          }
        : {
            id: externalId,
            text,
            authorUsername: authorHandle,
            mediaId: (rawData.mediaId as string) ?? "",
            createdAt,
            platform: "instagram",
          }
    );

    // Insert content item
    const { data: contentItem, error: contentError } = await db
      .from("content_items")
      .insert({
        user_id: userId,
        platform,
        external_id: externalId,
        content: text,
        author_handle: authorHandle,
        direction: normalized.direction,
        reach: normalized.reach,
        velocity: normalized.velocity,
        raw_data: rawData,
        ingested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (contentError || !contentItem) {
      errors.push(`Failed to insert content ${externalId}: ${contentError?.message}`);
      return false;
    }

    // Run pipeline — retry on transient network/API errors
    const pipelineResult = await withRetry(
      () => runPipeline(text, {
        direction: normalized.direction,
        reach: normalized.reach,
        velocity: normalized.velocity,
      }),
      { label: `pipeline(${platform}/${externalId})`, maxAttempts: 3, baseDelayMs: 1000 }
    );

    const actionOutput = pipelineResult.actionAgent;
    const isActionError = isPipelineError(actionOutput);

    const finalRiskLevel = isActionError
      ? "none"
      : (actionOutput as ActionAgentOutput).final_risk_level;
    const contentAction = isActionError
      ? "log"
      : (actionOutput as ActionAgentOutput).actions_executed.content_action;
    const accountAction = isActionError
      ? "none"
      : (actionOutput as ActionAgentOutput).actions_executed.account_action;
    const supplementaryActions = isActionError
      ? []
      : (actionOutput as ActionAgentOutput).actions_executed.supplementary_actions;

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
      errors.push(`Failed to insert pipeline run for ${externalId}: ${runError?.message}`);
      return false;
    }

    // Write audit log — always, including pass decisions
    const { error: auditError } = await db.from("audit_log").insert({
      pipeline_run_id: pipelineRun.id,
      content_item_id: contentItem.id,
      user_id: userId,
      input_text: text,
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
    if (auditError) console.error("[poller] audit_log insert failed:", auditError.message);

    // Execute platform actions for hide/delete decisions
    if (!isActionError && (contentAction === "hide" || contentAction === "delete")) {
      await executePlatformActions({
        userId,
        platform,
        externalId,
        authorId,
        actionOutput: actionOutput as ActionAgentOutput,
        pipelineRunId: pipelineRun.id,
      });
    }

    return true;
  } catch (err) {
    errors.push(`Unhandled error processing ${externalId}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── pollAllAccounts ────────────────────────────────────────────────────────

export async function pollAllAccounts(): Promise<PollResult> {
  const start = Date.now();
  const errors: string[] = [];
  let accountsPolled = 0;
  let contentFetched = 0;
  let pipelineRunsCreated = 0;

  try {
    // Fetch all active tokens
    const { data: tokens, error: tokensError } = await db
      .from("platform_tokens")
      .select("user_id, platform, platform_user_id, platform_username")
      .eq("status", "active");

    if (tokensError || !tokens) {
      errors.push(`Failed to fetch active tokens: ${tokensError?.message}`);
      return { accountsPolled, contentFetched, pipelineRunsCreated, errors, durationMs: Date.now() - start };
    }

    for (const token of tokens) {
      const { user_id: userId, platform } = token;
      accountsPolled++;

      try {
        if (platform === "twitter") {
          const sinceId = await getPollCursor(userId, "twitter");
          const mentions = await withRetry(
            () => fetchMentions(userId, sinceId ?? undefined),
            { label: `fetchMentions(${userId})`, maxAttempts: 3, baseDelayMs: 500 }
          );
          let latestId: string | null = null;

          for (const mention of mentions) {
            contentFetched++;
            if (await contentExists("twitter", mention.id)) continue;

            const ok = await processContentItem({
              userId,
              platform: "twitter",
              externalId: mention.id,
              text: mention.text,
              authorHandle: mention.authorUsername,
              authorId: mention.authorId,
              createdAt: mention.createdAt,
              rawData: {
                authorId: mention.authorId,
                conversationId: mention.conversationId,
                metrics: mention.metrics,
                createdAt: mention.createdAt,
              },
              errors,
            });

            if (ok) {
              pipelineRunsCreated++;
              // Track the numerically highest tweet ID (snowflake IDs sort chronologically)
              if (!latestId || BigInt(mention.id) > BigInt(latestId)) {
                latestId = mention.id;
              }
            }
          }

          if (latestId) await setPollCursor(userId, "twitter", latestId);

        } else if (platform === "instagram") {
          const comments = await withRetry(
            () => fetchRecentComments(userId),
            { label: `fetchRecentComments(${userId})`, maxAttempts: 3, baseDelayMs: 500 }
          );

          for (const comment of comments) {
            contentFetched++;
            if (await contentExists("instagram", comment.id)) continue;

            const ok = await processContentItem({
              userId,
              platform: "instagram",
              externalId: comment.id,
              text: comment.text,
              authorHandle: comment.authorUsername,
              authorId: null, // Instagram Graph API does not return commenter user IDs
              createdAt: comment.createdAt,
              rawData: {
                mediaId: comment.mediaId,
                createdAt: comment.createdAt,
              },
              errors,
            });

            if (ok) pipelineRunsCreated++;
          }
        }
      } catch (err) {
        errors.push(`Error polling ${platform} for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Upsert poll status per unique user
    const userIds = [...new Set(tokens.map((t) => t.user_id))];
    const pollResult: PollResult = {
      accountsPolled,
      contentFetched,
      pipelineRunsCreated,
      errors,
      durationMs: Date.now() - start,
    };

    for (const userId of userIds) {
      const { error: statusError } = await db.from("poll_status").upsert(
        {
          user_id: userId,
          last_poll_at: new Date().toISOString(),
          last_result: pollResult,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (statusError) console.error("[poller] poll_status upsert failed:", statusError.message);
    }

    return pollResult;
  } catch (err) {
    errors.push(`pollAllAccounts threw: ${err instanceof Error ? err.message : String(err)}`);
    return { accountsPolled, contentFetched, pipelineRunsCreated, errors, durationMs: Date.now() - start };
  }
}
