import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFIER_SYSTEM_PROMPT } from "./prompts/classifier";
import type { ClassifierOutput, ContentContext, PipelineError } from "./types";
import { extractJSON } from "./extract-json";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("[classifier] ANTHROPIC_API_KEY is not set!");
}
const client = new Anthropic({ apiKey: apiKey ?? "" });

export async function runClassifier(
  content: string,
  context: ContentContext
): Promise<ClassifierOutput | PipelineError> {
  if (!apiKey) {
    console.error("[classifier] ANTHROPIC_API_KEY missing — cannot call API");
    return {
      error: "missing_api_key",
      stage: "classifier",
      details: "ANTHROPIC_API_KEY environment variable is not set",
    };
  }

  const userMessage = JSON.stringify({ content, context });
  console.log("[classifier] Calling Anthropic API with model claude-haiku-4-5-20251001...");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      temperature: 0,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const parsed = extractJSON(rawText);
    if (parsed === null) {
      return {
        error: "invalid_json_response",
        stage: "classifier",
        details: rawText.slice(0, 500),
      };
    }

    // Validate required top-level fields
    const output = parsed as Record<string, unknown>;
    const required = [
      "schema_version",
      "pipeline_stage",
      "input_text",
      "context",
      "harm_scores",
      "pattern_flags",
      "risk_level",
      "action_scope",
      "fp_risk_factors",
      "routing",
      "reasoning",
    ];
    for (const field of required) {
      if (!(field in output)) {
        return {
          error: "missing_required_field",
          stage: "classifier",
          details: `Missing field: ${field}`,
        };
      }
    }

    if (output.pipeline_stage !== "classifier") {
      return {
        error: "wrong_pipeline_stage",
        stage: "classifier",
        details: `Expected "classifier", got "${output.pipeline_stage}"`,
      };
    }

    return parsed as ClassifierOutput;
  } catch (err) {
    return {
      error: "api_call_failed",
      stage: "classifier",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}
