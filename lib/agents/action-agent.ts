import Anthropic from "@anthropic-ai/sdk";
import { ACTION_AGENT_SYSTEM_PROMPT } from "./prompts/action-agent";
import type {
  ActionAgentOutput,
  ClassifierOutput,
  FPCheckerOutput,
  PipelineError,
} from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runActionAgent(
  input: ClassifierOutput | FPCheckerOutput
): Promise<ActionAgentOutput | PipelineError> {
  // Safety check: reject raw classifier output unless bypass was explicitly set
  if (input.pipeline_stage === "classifier") {
    const classifierInput = input as ClassifierOutput;
    if (!classifierInput.routing.bypass_fp_agent) {
      return {
        error: "fp_agent_review_required",
        action_taken: "none",
        pipeline_complete: false,
        stage: "action_agent",
      };
    }
  }

  const userMessage = JSON.stringify(input);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      temperature: 0,
      system: ACTION_AGENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        error: "invalid_json_response",
        stage: "action_agent",
        details: rawText.slice(0, 500),
      };
    }

    const output = parsed as Record<string, unknown>;

    // Handle the safety-check error response from the model itself
    if ("error" in output && output.error === "fp_agent_review_required") {
      return {
        error: "fp_agent_review_required",
        action_taken: "none",
        pipeline_complete: false,
        stage: "action_agent",
      };
    }

    const required = [
      "schema_version",
      "pipeline_stage",
      "execution_timestamp",
      "input_text",
      "final_risk_level",
      "final_action_scope",
      "actions_executed",
      "timing",
      "irreversible_action_justification",
      "category_triggers_applied",
      "action_basis",
      "pipeline_complete",
    ];
    for (const field of required) {
      if (!(field in output)) {
        return {
          error: "missing_required_field",
          stage: "action_agent",
          details: `Missing field: ${field}`,
        };
      }
    }

    if (output.pipeline_stage !== "action_agent") {
      return {
        error: "wrong_pipeline_stage",
        stage: "action_agent",
        details: `Expected "action_agent", got "${output.pipeline_stage}"`,
      };
    }

    return parsed as ActionAgentOutput;
  } catch (err) {
    return {
      error: "api_call_failed",
      stage: "action_agent",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}
