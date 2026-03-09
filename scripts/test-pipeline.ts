/**
 * End-to-end pipeline test — runs 5 sample content strings through
 * all three AI stages and prints a structured summary.
 *
 * Usage:
 *   npx tsx scripts/test-pipeline.ts
 *
 * Requires ANTHROPIC_API_KEY in .env.local
 */

import "dotenv/config";
import { runPipeline } from "../lib/agents/pipeline";
import { isPipelineError } from "../lib/agents/types";
import type { ContentContext, ActionAgentOutput } from "../lib/agents/types";

interface Sample {
  label: string;
  text: string;
  context: ContentContext;
}

const SAMPLES: Sample[] = [
  {
    label: "Severe threat",
    text: "I know where you live and I will make you pay for that game. Watch your back.",
    context: { direction: "direct", reach: "low", velocity: "critical" },
  },
  {
    label: "Sports hyperbole (expected FP)",
    text: "You absolute trash player, you killed our season last night. Absolute garbage performance.",
    context: { direction: "direct", reach: "medium", velocity: "fast" },
  },
  {
    label: "Coordinated harassment",
    text: "Everyone report this account. Spam his DMs. Make him quit. RT to spread.",
    context: { direction: "direct", reach: "high", velocity: "critical" },
  },
  {
    label: "Benign fan comment",
    text: "Amazing game tonight! You are the best in the league, keep it up! 🔥🏆",
    context: { direction: "direct", reach: "low", velocity: "slow" },
  },
  {
    label: "Doxxing attempt",
    text: "Just found his home address and family info. Posting it in the thread below for everyone.",
    context: { direction: "direct", reach: "high", velocity: "critical" },
  },
];

function badge(value: string) {
  const colors: Record<string, string> = {
    severe: "\x1b[31m",
    high: "\x1b[33m",
    medium: "\x1b[36m",
    low: "\x1b[34m",
    none: "\x1b[90m",
  };
  const reset = "\x1b[0m";
  const color = colors[value] ?? "\x1b[37m";
  return `${color}${value}${reset}`;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Whistle — Pipeline End-to-End Test");
  console.log("═══════════════════════════════════════════════════\n");

  for (const { label, text, context } of SAMPLES) {
    console.log(`▶  ${label}`);
    console.log(`   Reach: ${context.reach} | Velocity: ${context.velocity}`);
    console.log(`   Text: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`);

    const start = Date.now();
    const result = await runPipeline(text, context);
    const ms = Date.now() - start;

    const action = result.actionAgent;

    if (isPipelineError(action)) {
      console.log(
        `   \x1b[31m✗ Pipeline error\x1b[0m — stage: ${action.stage ?? "unknown"} | ${action.error}`
      );
    } else {
      const out = action as ActionAgentOutput;
      const fpRan = result.stagesCompleted.includes("fp_checker");
      console.log(
        `   \x1b[32m✓\x1b[0m Risk: ${badge(out.final_risk_level)}` +
          `  Action: ${badge(out.actions_executed.content_action)}` +
          `  FP ran: ${fpRan ? "yes" : "no (bypassed)"}` +
          `  Override: ${result.safety_override_applied ? "\x1b[35myes\x1b[0m" : "no"}` +
          `  (${ms}ms)`
      );
      if (out.irreversible_action_justification) {
        console.log(`   Justification: ${out.irreversible_action_justification}`);
      }
      if (result.override_reason) {
        console.log(`   \x1b[35mOverride reason:\x1b[0m ${result.override_reason}`);
      }
    }
    console.log();
  }

  console.log("═══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
