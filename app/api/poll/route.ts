import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { pollAllAccounts } from "@/lib/polling/poller";
import { withLock } from "@/lib/polling/lock";

// ── Manual poll trigger ────────────────────────────────────────────────────
// Used by the "Poll Now" button on the Connect screen. Authenticated against
// the current Supabase user.
//
// Concurrency is enforced by a Postgres-backed distributed lock (see
// lib/polling/lock.ts), shared with the cron route at /api/cron/poll. This
// replaces the previous in-process module-level lock, which only worked
// within a single Node worker — Vercel serverless invocations don't share
// memory across instances, so the in-process lock couldn't actually prevent
// overlapping polls between cron and manual triggers.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await withLock(() => pollAllAccounts());

  if (!outcome.acquired) {
    return NextResponse.json(
      {
        error: "A poll is already in progress.",
        heldBy: outcome.heldBy,
        expiresAt: outcome.expiresAt,
      },
      {
        status: 409,
        headers: outcome.expiresAt
          ? {
              "Retry-After": String(
                Math.max(
                  1,
                  Math.ceil(
                    (new Date(outcome.expiresAt).getTime() - Date.now()) / 1000
                  )
                )
              ),
            }
          : {},
      }
    );
  }

  return NextResponse.json(outcome.result);
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
