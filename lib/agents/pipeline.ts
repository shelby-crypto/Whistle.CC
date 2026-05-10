import { runClassifier } from "./classifier";
import { runFPChecker } from "./fp-checker";
import { runActionAgent } from "./action-agent";
import type {
  ActionAgentOutput,
  ClassifierOutput,
  ContentContext,
  FPCheckerOutput,
  PipelineError,
  PipelineResult,
} from "./types";
import { isPipelineError } from "./types";

export async function runPipeline(
  content: string,
  context: ContentContext
): Promise<PipelineResult> {
  const start = Date.now();
  const stagesCompleted: string[] = [];

  // ── Stage 1: Classifier ────────────────────────────────────────────────────
  let classifierResult: ClassifierOutput | PipelineError;
  try {
    // PRIVACY: Never log raw user content. Whistle's premise is "content
    // hidden by default for user wellbeing" — slurs, threats, and doxxing
    // details must not flow into Vercel logs. Log only counters/metadata.
    console.log(
      `[pipeline] Running classifier (content_chars=${content.length}, direction=${context.direction}, reach=${context.reach}, velocity=${context.velocity})`,
    );
    classifierResult = await runClassifier(content, context);
    console.log(
      "[pipeline] Classifier result:",
      isPipelineError(classifierResult)
        ? `ERROR(${classifierResult.error})`
        : `risk_level=${classifierResult.risk_level}`,
    );
  } catch (err) {
    // Log only the error class/name — the message can include excerpted
    // model output or chunked user content.
    const errName = err instanceof Error ? err.name : "UnknownError";
    console.error(`[pipeline] Classifier threw unexpectedly: ${errName}`);
    classifierResult = {
      error: "classifier_threw_unexpectedly",
      stage: "classifier",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (isPipelineError(classifierResult)) {
    // Log only the typed error code — `details` may contain raw model
    // output or excerpted user content.
    console.error(
      `[pipeline] Classifier failed, skipping remaining stages: ${classifierResult.error}`,
    );
    return {
      classifier: classifierResult,
      actionAgent: {
        error: "skipped_due_to_classifier_failure",
        stage: "action_agent",
      },
      stagesCompleted,
      durationMs: Date.now() - start,
    };
  }
  stagesCompleted.push("classifier");

  // ── Stage 2: FP Checker (conditional) ─────────────────────────────────────
  let fpCheckerResult: FPCheckerOutput | PipelineError | undefined;
  let actionAgentInput: ClassifierOutput | FPCheckerOutput = classifierResult;

  if (classifierResult.routing.bypass_fp_agent) {
    // Skip FP checker — send classifier output directly to action agent
    fpCheckerResult = undefined;
  } else if (classifierResult.routing.send_to_fp_agent) {
    try {
      fpCheckerResult = await runFPChecker(classifierResult);
    } catch (err) {
      fpCheckerResult = {
        error: "fp_checker_threw_unexpectedly",
        stage: "fp_checker",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    if (isPipelineError(fpCheckerResult)) {
      return {
        classifier: classifierResult,
        fpChecker: fpCheckerResult,
        actionAgent: {
          error: "skipped_due_to_fp_checker_failure",
          stage: "action_agent",
        },
        stagesCompleted,
        durationMs: Date.now() - start,
      };
    }

    stagesCompleted.push("fp_checker");
    actionAgentInput = fpCheckerResult;
  }

  // ── Stage 3: Action Agent ──────────────────────────────────────────────────
  let actionAgentResult: ActionAgentOutput | PipelineError;
  try {
    actionAgentResult = await runActionAgent(actionAgentInput);
  } catch (err) {
    actionAgentResult = {
      error: "action_agent_threw_unexpectedly",
      stage: "action_agent",
      details: err instanceof Error ? err.message : String(err),
    };
  }

  if (isPipelineError(actionAgentResult)) {
    return {
      classifier: classifierResult,
      fpChecker: fpCheckerResult,
      actionAgent: actionAgentResult,
      stagesCompleted,
      durationMs: Date.now() - start,
    };
  }
  stagesCompleted.push("action_agent");

  // ── Orchestrator Safety Override ───────────────────────────────────────────
  // If delete or block_sender returned with null justification, downgrade.
  let safetyOverrideApplied = false;
  let overrideReason: string | undefined;

  const { content_action, account_action } =
    actionAgentResult.actions_executed;

  if (
    (content_action === "delete" || account_action === "block_sender") &&
    actionAgentResult.irreversible_action_justification === null
  ) {
    safetyOverrideApplied = true;
    const overrides: string[] = [];

    if (content_action === "delete") {
      actionAgentResult.actions_executed.content_action = "hide";
      overrides.push("delete -> hide");
    }
    if (account_action === "block_sender") {
      actionAgentResult.actions_executed.account_action = "mute_sender";
      overrides.push("block_sender -> mute_sender");
    }

    overrideReason = `Irreversible action(s) [${overrides.join(", ")}] returned with null justification. Downgraded by orchestrator safety override.`;
    console.warn("[pipeline] Safety override applied:", overrideReason);
  }

  return {
    classifier: classifierResult,
    fpChecker: fpCheckerResult,
    actionAgent: actionAgentResult,
    stagesCompleted,
    durationMs: Date.now() - start,
    ...(safetyOverrideApplied && {
      safety_override_applied: true,
      override_reason: overrideReason,
    }),
  };
}
