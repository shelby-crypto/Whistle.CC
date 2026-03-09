import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pollAllAccounts } from "@/lib/polling/poller";

// ── In-process concurrency guard ───────────────────────────────────────────
// Prevents two simultaneous poll requests from racing through the pipeline
// and producing duplicate content_items / pipeline_runs.
//
// This is a module-level singleton, so it persists across requests within the
// same Node.js worker. In a multi-replica deployment you'd want a distributed
// lock (e.g., Supabase advisory lock), but for a single-instance Next.js app
// this is sufficient and avoids a round-trip.

const POLL_LOCK_TIMEOUT_MS = 120_000; // 2 min — safety valve if a poll hangs

const pollLock = {
  running: false,
  startedAt: 0,
};

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for an existing in-flight poll
  if (pollLock.running) {
    const elapsed = Date.now() - pollLock.startedAt;

    if (elapsed < POLL_LOCK_TIMEOUT_MS) {
      return NextResponse.json(
        {
          error: "A poll is already in progress.",
          elapsedMs: elapsed,
        },
        {
          status: 409,
          headers: {
            "Retry-After": String(Math.ceil((POLL_LOCK_TIMEOUT_MS - elapsed) / 1000)),
          },
        }
      );
    }

    // Stale lock — previous poll must have crashed without releasing. Force-reset.
    console.warn("[poll] Stale lock detected after %dms — resetting.", elapsed);
  }

  pollLock.running = true;
  pollLock.startedAt = Date.now();

  try {
    const result = await pollAllAccounts();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Poll failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  } finally {
    pollLock.running = false;
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
