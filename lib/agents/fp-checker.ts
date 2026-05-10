import Anthropic from "@anthropic-ai/sdk";
import { FP_CHECKER_SYSTEM_PROMPT } from "./prompts/fp-checker";
import type { ClassifierOutput, FPCheckerOutput, PipelineError } from "./types";
import { extractJSON } from "./extract-json";

// P1-14: fail fast on misconfig instead of constructing with undefined.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "[fp-checker] ANTHROPIC_API_KEY is required but was not set"
  );
}
const client = new Anthropic({ apiKey });

export async function runFPChecker(
  classifierOutput: ClassifierOutput
): Promise<FPCheckerOutput | PipelineError> {
  const userMessage = JSON.stringify(classifierOutput);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      temperature: 0,
      system: FP_CHECKER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const parsed = extractJSON(rawText);
    if (parsed === null) {
      return {
        error: "invalid_json_response",
        stage: "fp_checker",
        details: rawText.slice(0, 500),
      };
    }

    const output = parsed as Record<string, unknown>;
    const required = [
      "schema_version",
      "pipeline_stage",
      "original_classifier_output",
      "review_priority",
      "verdicts",
      "fp_factors_resolved",
      "final_risk_level",
      "final_action_scope",
      "fp_summary",
      "send_to_action_agent",
    ];
    for (const field of required) {
      if (!(field in output)) {
        return {
          error: "missing_required_field",
          stage: "fp_checker",
          details: `Missing field: ${field}`,
        };
      }
    }

    if (output.pipeline_stage !== "fp_checker") {
      return {
        error: "wrong_pipeline_stage",
        stage: "fp_checker",
        details: `Expected "fp_checker", got "${output.pipeline_stage}"`,
      };
    }

    if (output.send_to_action_agent !== true) {
      return {
        error: "fp_checker_blocked_forwarding",
        stage: "fp_checker",
        details: "send_to_action_agent must always be true",
      };
    }

    return parsed as FPCheckerOutput;
  } catch (err) {
    return {
      error: "api_call_failed",
      stage: "fp_checker",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}
