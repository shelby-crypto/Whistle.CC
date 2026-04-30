import { NextRequest, NextResponse } from "next/server";
import { pollAllAccounts } from "@/lib/polling/poller";
import { withLock } from "@/lib/polling/lock";

// ── Vercel Cron-triggered poll ──────────────────────────────────────────────
// Runs on a schedule (configured in vercel.json — currently every 5 minutes).
// Secured by CRON_SECRET — Vercel sends this as an Authorization header
// on cron invocations. Rejects requests without a valid secret.
//
// Wrapped in a Postgres-backed distributed lock (see lib/polling/lock.ts) so
// a slow poll can't overlap with the next cron tick or with a manual poll
// from /api/poll. Both routes share the same lock name.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await withLock(() => pollAllAccounts());

    if (!outcome.acquired) {
      // Another poll (cron tick or manual) is in flight. Skip silently
      // with a 200 so Vercel doesn't mark the cron as failed.
      console.log(
        "[cron/poll] Skipped — lock held by %s, expires at %s",
        outcome.heldBy ?? "unknown",
        outcome.expiresAt ?? "unknown"
      );
      return NextResponse.json({
        skipped: true,
        reason: "poll_already_in_progress",
        heldBy: outcome.heldBy,
        expiresAt: outcome.expiresAt,
      });
    }

    return NextResponse.json(outcome.result);
  } catch (err) {
    console.error("[cron/poll] Error:", err);
    return NextResponse.json(
      { error: "Poll failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
