/**
 * Extracts JSON from a model response that may be wrapped in markdown
 * code fences, have leading/trailing text, or other non-JSON content.
 *
 * Tries in order:
 * 1. Direct JSON.parse (fastest path if response is clean)
 * 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
 * 3. Find first { ... } block in the text
 */
export function extractJSON(rawText: string): unknown {
  const trimmed = rawText.trim();

  // 1. Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fallback strategies
  }

  // 2. Strip markdown code fences: ```json\n...\n``` or ```\n...\n```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue to next strategy
    }
  }

  // 3. Find the first { and last } to extract the JSON object
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // All strategies failed
    }
  }

  // Nothing worked — return null so the caller can handle the error
  return null;
}
