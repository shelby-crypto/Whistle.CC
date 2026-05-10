/**
 * Friendly, human-readable labels for the 13 harm categories produced by the
 * classifier (see `lib/agents/types.ts` / `HarmCategory`). These match the
 * mapping already used in app/feed/page.tsx — keep both in sync if you edit.
 *
 * The labels are written so they slot into a sentence like
 *   "This content was removed for X" / "X and Y" / "X, Y, and Z".
 */

import type { HarmCategory } from "@/lib/agents/types";

export const HARM_LABELS: Record<HarmCategory, string> = {
  H1_gender: "gender-based harassment",
  H2_sexual_orientation: "harassment based on sexual orientation",
  H3_body_appearance: "body shaming",
  H4_racial_identity: "racial harassment",
  H5_political: "political harassment",
  H6_professional_competence: "attacks on professional competence",
  H7_religion: "religious harassment",
  H8_nationality_immigration: "nationality-based harassment",
  H9_sexualization: "sexual harassment",
  H10_threats_violence: "threats of violence",
  H11_doxxing_privacy: "doxxing or privacy violations",
  H12_betting_harassment: "betting-related harassment",
  H13_coordinated_harassment: "coordinated harassment",
};

type Score = "none" | "low" | "medium" | "high" | "severe";

interface HarmScoreEntry {
  score: Score;
  confidence: "high" | "medium" | "low";
}

/**
 * Shape of the slice of `classifier_output` this module reads. We avoid
 * importing the full ClassifierOutput type so callers can pass partial /
 * loosely-typed JSONB blobs straight from Supabase without casting.
 */
export interface HarmScoresBlob {
  harm_scores?: Partial<Record<HarmCategory, HarmScoreEntry>> | null;
}

/**
 * Build a single-sentence summary of why a piece of content was removed.
 *
 * Strategy (in order):
 *   1. Categories scored `severe` or `high` — these are the strongest signal
 *      and almost always explain why the post was actioned.
 *   2. If none, fall back to `medium`-scored categories.
 *   3. If still none, return null so the caller can render a generic fallback
 *      ("Targeted insults, slurs, threats, and harassment") instead.
 *
 * Categories are joined with a serial comma so the sentence reads naturally
 * for 1, 2, or 3+ reasons.
 */
export function summarizeRemovalReason(
  classifierOutput: HarmScoresBlob | null | undefined,
): string | null {
  const scores = classifierOutput?.harm_scores;
  if (!scores) return null;

  const top: string[] = [];
  const medium: string[] = [];

  for (const [key, entry] of Object.entries(scores)) {
    if (!entry) continue;
    const label = HARM_LABELS[key as HarmCategory];
    if (!label) continue;
    if (entry.score === "severe" || entry.score === "high") {
      top.push(label);
    } else if (entry.score === "medium") {
      medium.push(label);
    }
  }

  const picked = top.length > 0 ? top : medium;
  if (picked.length === 0) return null;

  return joinWithSerialComma(picked);
}

/**
 * Join a list of phrases with commas and a final "and" — i.e., serial-comma
 * style. Single-item lists return verbatim; two-item lists use "X and Y";
 * three or more use "X, Y, and Z".
 */
function joinWithSerialComma(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const head = items.slice(0, -1).join(", ");
  const tail = items[items.length - 1];
  return `${head}, and ${tail}`;
}
