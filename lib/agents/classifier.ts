import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFIER_SYSTEM_PROMPT } from "./prompts/classifier";
import type { ClassifierOutput, ContentContext, PipelineError } from "./types";
import { extractJSON } from "./extract-json";

// P1-14: fail fast on missing API key. Constructing the SDK with an empty
// string used to silently produce 401s at first call; throwing at module load
// surfaces the misconfig in deploy logs instead of in user-facing 500s.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error(
    "[classifier] ANTHROPIC_API_KEY is required but was not set"
  );
}
const client = new Anthropic({ apiKey });

export async function runClassifier(
  content: string,
  context: ContentContext
): Promise<ClassifierOutput | PipelineError> {
  // P1-14: missing-key check moved to module load; nothing to do here.

  // PROMPT-INJECTION DEFENSE: wrap the raw user content in
  // <user_content>...</user_content> tags so the system prompt's injection-
  // defense rules can refer to a stable boundary. Anything inside is DATA;
  // the model is instructed never to treat it as instructions. The "context"
  // object is system metadata and stays outside the tags.
  //
  // PRIVACY: don't log `userMessage` — it carries the raw user content.
  const userMessage = `<context>${JSON.stringify(context)}</context>\n<user_content>${content}</user_content>`;
  console.log("[classifier] Calling Anthropic API with model claude-haiku-4-5-20251001...");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
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
