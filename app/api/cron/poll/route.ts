import { NextRequest, NextResponse } from "next/server";
import { pollAllAccounts } from "@/lib/polling/poller";

// ── Vercel Cron-triggered poll ──────────────────────────────────────────────
// Runs on a schedule (configured in vercel.json).
// Secured by CRON_SECRET — Vercel sends this as an Authorization header
// on cron invocations. Rejects requests without a valid secret.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollAllAccounts();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/poll] Error:", err);
    return NextResponse.json(
      { error: "Poll failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
