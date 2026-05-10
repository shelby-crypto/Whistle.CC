import { NextRequest, NextResponse } from "next/server";
import { drainWebhookEvents } from "@/lib/ingest/webhook-queue";

// ── Vercel Cron-triggered webhook event drain ────────────────────────────────
// Runs frequently (configured in vercel.json — currently every minute).
// Pulls up to N pending rows from `webhook_events`, processes each through
// the unified ingest pipeline, and marks done/failed/pending for retry.
//
// Secured by CRON_SECRET — Vercel sends this as an Authorization header
// on cron invocations.
//
// Why is processing here instead of inside the webhook handler? See the
// header comment in `app/api/webhook/instagram/route.ts`. Short version:
// pipeline work routinely exceeds Meta's ~10s webhook timeout, and
// running it inline triggers Meta's retry storm into a still-running
// handler (duplicate hides/deletes / Anthropic spend). Async drain is
// the correct architecture.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLAIM_LIMIT = 20; // events processed per tick

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainWebhookEvents(CLAIM_LIMIT);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/process-webhooks] Error:", err);
    return NextResponse.json(
      {
        error: "drain_failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
