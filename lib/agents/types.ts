// ─── Primitive Types ──────────────────────────────────────────────────────────

export type Score = "none" | "low" | "medium" | "high" | "severe";
export type Confidence = "high" | "medium" | "low";
export type RiskLevel = "none" | "low" | "medium" | "high" | "severe";
export type ActionScope = "content_only" | "content_and_account";
export type Direction = "direct" | "indirect";
export type Reach = "low" | "medium" | "high";
export type Velocity = "slow" | "moderate" | "fast" | "critical";

// ─── Enum Types ───────────────────────────────────────────────────────────────

export type HarmCategory =
  | "H1_gender"
  | "H2_sexual_orientation"
  | "H3_body_appearance"
  | "H4_racial_identity"
  | "H5_political"
  | "H6_professional_competence"
  | "H7_religion"
  | "H8_nationality_immigration"
  | "H9_sexualization"
  | "H10_threats_violence"
  | "H11_doxxing_privacy"
  | "H12_betting_harassment"
  | "H13_coordinated_harassment";

export type PatternFlag =
  | "dogpile_detected"
  | "cascade_precursor"
  | "cross_platform_risk"
  | "prior_escalation_history"
  | "reply_flooding";

export type FPRiskFactor =
  | "missing_thread_context"
  | "sarcasm_possible"
  | "sports_hyperbole_possible"
  | "coded_language_low_context"
  | "fan_enthusiasm_possible"
  | "ambiguous_pronoun_reference"
  | "no_athlete_confirmation"
  | "cross_cultural_idiom"
  | "account_history_unavailable";

export type SupplementaryAction =
  | "notify_athlete_team"
  | "preserve_evidence"
  | "flag_network"
  | "suppress_thread"
  | "log_for_legal";

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ContentContext {
  direction: Direction;
  reach: Reach;
  velocity: Velocity;
}

// ─── Pipeline Error ───────────────────────────────────────────────────────────

export interface PipelineError {
  error: string;
  stage?: string;
  action_taken?: string;
  pipeline_complete?: false;
  details?: unknown;
}

export function isPipelineError(val: unknown): val is PipelineError {
  return typeof val === "object" && val !== null && "error" in val;
}

// ─── Stage 1: Classifier Output ───────────────────────────────────────────────

export interface ClassifierOutput {
  schema_version: "1.0";
  pipeline_stage: "classifier";
  input_text: string;
  context: ContentContext;
  harm_scores: Record<HarmCategory, { score: Score; confidence: Confidence }>;
  pattern_flags: PatternFlag[];
  risk_level: RiskLevel;
  action_scope: ActionScope;
  fp_risk_factors: FPRiskFactor[];
  routing: {
    send_to_fp_agent: boolean;
    fp_review_priority: "standard" | "urgent" | null;
    bypass_fp_agent: boolean;
    bypass_reason: string | null;
  };
  reasoning: string; // min 2 sentences, written for an AI reader with no prior context
}

// ─── Stage 2: FP Checker Output ───────────────────────────────────────────────

export interface FPCheckerOutput {
  schema_version: "1.0";
  pipeline_stage: "fp_checker";
  original_classifier_output: ClassifierOutput;
  review_priority: "standard" | "urgent";
  verdicts: Record<
    HarmCategory,
    {
      verdict: "confirmed" | "downgraded" | "overridden" | "not_reviewed";
      original_score: Score;
      final_score: Score;
      justification: string | null; // required for downgraded/overridden
    }
  >;
  fp_factors_resolved: Record<
    FPRiskFactor,
    "resolved" | "unresolved" | "not_applicable"
  >;
  final_risk_level: RiskLevel;
  final_action_scope: ActionScope;
  fp_summary: string; // 2-3 sentences for the Action Agent, not for a human
  send_to_action_agent: true;
}

// ─── Stage 3: Action Agent Output ─────────────────────────────────────────────

export interface ActionAgentOutput {
  schema_version: "1.0";
  pipeline_stage: "action_agent";
  execution_timestamp: string; // ISO 8601
  input_text: string;
  final_risk_level: RiskLevel;
  final_action_scope: ActionScope;
  actions_executed: {
    content_action: "pass" | "log" | "hide" | "delete";
    account_action: "none" | "mute_sender" | "block_sender";
    supplementary_actions: SupplementaryAction[];
  };
  timing: {
    execution_required_by: string | null; // ISO 8601 or "immediate" or null
    executed_at: string; // ISO 8601
  };
  irreversible_action_justification: string | null;
  category_triggers_applied: string[];
  action_basis: string; // 1-2 sentences for audit log
  pipeline_complete: true;
}

// ─── Pipeline Orchestrator Result ─────────────────────────────────────────────

export interface PipelineResult {
  classifier: ClassifierOutput | PipelineError;
  fpChecker?: FPCheckerOutput | PipelineError;
  actionAgent: ActionAgentOutput | PipelineError;
  stagesCompleted: string[];
  durationMs: number;
  safety_override_applied?: boolean;
  override_reason?: string;
}

// ─── Platform Content Types ───────────────────────────────────────────────────

export interface TwitterContent {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  metrics: {
    replyCount: number;
    retweetCount: number;
    likeCount: number;
  };
  conversationId: string;
  platform: "twitter";
}

export interface InstagramContent {
  id: string;
  text: string;
  authorUsername: string;
  mediaId: string;
  createdAt: string;
  platform: "instagram";
}

export interface NormalizedContent {
  platform: "twitter" | "instagram";
  externalId: string;
  text: string;
  authorHandle: string;
  direction: Direction; // always "direct" for mentions/comments
  reach: Reach;
  velocity: Velocity;
  rawData: Record<string, unknown>;
}

// ─── Poll Types ───────────────────────────────────────────────────────────────

export interface PollResult {
  accountsPolled: number;
  contentFetched: number;
  pipelineRunsCreated: number;
  errors: string[];
  durationMs: number;
}
