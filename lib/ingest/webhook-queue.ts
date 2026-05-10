import { db } from "@/lib/db/supabase";
import { processContentItem } from "@/lib/polling/poller";
import { loadCombinedAllowlist } from "@/lib/allowlist/load-combined";

// ── Types ───────────────────────────────────────────────────────────────────

export type WebhookPlatform = "instagram" | "twitter";

/**
 * Stable shape for a queued webhook event payload. The webhook handler
 * normalises into this shape before insert; the cron worker reads it back.
 */
export interface WebhookEventPayload {
  platform: WebhookPlatform;
  /** "comment" or "dm" — drives downstream behaviour. */
  contentType: "comment" | "dm";
  /** Platform's external ID for the content (used by the dedup logic
   *  inside processContentItem and by `content_items.external_id`). */
  externalId: string;
  text: string;
  authorHandle: string;
  authorId: string | null;
  /** ISO 8601 timestamp from the platform's event. */
  createdAt: string;
  /** Anything else from the original webhook event the pipeline may want. */
  rawData: Record<string, unknown>;
}

// ── Idempotent enqueue ──────────────────────────────────────────────────────
//
// Inserts a row into webhook_events. The (platform, event_id) UNIQUE
// constraint catches duplicate Meta deliveries — on conflict we silently
// skip and report `duplicate: true`. The webhook handler still returns 200
// so Meta stops retrying.
export async function enqueueWebhookEvent(params: {
  platform: WebhookPlatform;
  /** Stable dedup key. Webhook handler builds this from the platform's
   *  unique IDs (e.g. "ig_comment_<commentId>" or "ig_dm_<messageId>"). */
  eventId: string;
  userId: string | null;
  payload: WebhookEventPayload;
}): Promise<{ enqueued: boolean; duplicate: boolean }> {
  const { error } = await db.from("webhook_events").insert({
    platform: params.platform,
    event_id: params.eventId,
    user_id: params.userId,
    payload: params.payload,
    status: "pending",
  });

  if (error) {
    // 23505 = unique_violation — that's the duplicate-delivery case and
    // we treat it as success.
    if ((error as { code?: string }).code === "23505") {
      return { enqueued: false, duplicate: true };
    }
    console.error("[webhook-queue] enqueue failed:", error.message);
    return { enqueued: false, duplicate: false };
  }
  return { enqueued: true, duplicate: false };
}

// ── Drain ───────────────────────────────────────────────────────────────────

interface DrainResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

/**
 * Process up to `claimLimit` pending webhook events.
 *
 * Uses the `claim_pending_webhook_events` Postgres function which atomically
 * marks rows as `processing` (with FOR UPDATE SKIP LOCKED) so concurrent
 * cron ticks don't double-process the same row.
 *
 * For each claimed row:
 *   1. Load the user's combined allowlist (explicit + followed) so the
 *      webhook honours the user's allowlist — this was the P1-11 bug.
 *   2. Call `processContentItem` (the unified ingest entry point) with
 *      the payload + allowlist.
 *   3. Update the row to `done` (success), `failed` (final retry exhausted),
 *      or back to `pending` (transient — will retry next tick).
 */
export async function drainWebhookEvents(
  claimLimit: number = 20,
): Promise<DrainResult> {
  const errors: string[] = [];
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  const { data: claimed, error: claimError } = await db.rpc(
    "claim_pending_webhook_events",
    { claim_limit: claimLimit },
  );

  if (claimError) {
    errors.push(`claim_pending_webhook_events failed: ${claimError.message}`);
    return { attempted, succeeded, failed, errors };
  }

  type ClaimedRow = {
    id: number;
    platform: string;
    event_id: string;
    user_id: string | null;
    payload: WebhookEventPayload;
    attempts: number;
  };

  const rows = (claimed ?? []) as ClaimedRow[];

  for (const row of rows) {
    attempted++;
    const localErrors: string[] = [];

    try {
      if (!row.user_id) {
        // The webhook couldn't resolve a user_id at enqueue time — mark
        // skipped, not failed (retrying won't help).
        await db
          .from("webhook_events")
          .update({
            status: "skipped",
            last_error: "no_user_id",
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }

      // Build combined allowlist for THIS user+platform. Fixes P1-11:
      // the inline webhook handler previously called processContentItem
      // with allowlistSet=undefined, so allowlisted senders got moderated.
      const allowlistSet = await loadCombinedAllowlist(
        row.user_id,
        row.payload.platform,
      );

      const ok = await processContentItem({
        userId: row.user_id,
        platform: row.payload.platform,
        externalId: row.payload.externalId,
        text: row.payload.text,
        authorHandle: row.payload.authorHandle,
        authorId: row.payload.authorId,
        createdAt: row.payload.createdAt,
        rawData: row.payload.rawData,
        contentType: row.payload.contentType,
        allowlistSet,
        errors: localErrors,
      });

      if (ok) {
        succeeded++;
        await db
          .from("webhook_events")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } else {
        // processContentItem returned false — pipeline error or insert
        // failure. Decide retry vs final-fail by attempt count.
        const reason = localErrors.join("; ").slice(0, 1000) || "unknown";
        const exhausted = row.attempts >= 4; // matches max_attempts=5 default
        const status = exhausted ? "failed" : "pending";
        await db
          .from("webhook_events")
          .update({
            status,
            last_error: reason,
            ...(exhausted && { processed_at: new Date().toISOString() }),
          })
          .eq("id", row.id);
        if (exhausted) {
          failed++;
        }
        errors.push(`event #${row.id}: ${reason}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`event #${row.id} threw: ${message}`);
      const exhausted = row.attempts >= 4;
      const status = exhausted ? "failed" : "pending";
      await db
        .from("webhook_events")
        .update({
          status,
          last_error: message.slice(0, 1000),
          ...(exhausted && { processed_at: new Date().toISOString() }),
        })
        .eq("id", row.id);
      if (exhausted) {
        failed++;
      }
    }
  }

  return { attempted, succeeded, failed, errors };
}
