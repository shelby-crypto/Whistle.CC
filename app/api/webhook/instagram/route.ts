import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db/supabase";
import { enqueueWebhookEvent } from "@/lib/ingest/webhook-queue";

// ── Instagram Webhook Handler ───────────────────────────────────────────────
// Receives real-time notifications from Meta's webhook system:
//   - Comments on posts          → queued for moderation pipeline
//   - DMs (new conversations only) → queued for moderation pipeline
//
// GET  → Verification challenge (Meta sends this once when you register)
// POST → Incoming events
//
// PROCESSING MODEL (after P1-3)
// The previous handler ran the full Anthropic pipeline + DB writes +
// platform actions inline, which:
//   - exceeded Meta's ~10s webhook timeout under realistic load,
//   - triggered Meta's aggressive retry behaviour (which then raced the
//     still-running first invocation, producing duplicate hides/deletes),
//   - had no replay protection,
//   - had no atomic idempotency for concurrent deliveries.
//
// Now: the handler verifies the signature, applies a 5-minute freshness
// window (rejects stale replays), normalises each event, and inserts a
// row into the `webhook_events` queue. The (platform, event_id) UNIQUE
// constraint provides atomic deduplication — concurrent deliveries of the
// same event hit the constraint and are silently absorbed. The handler
// returns 200 in <1s. A separate Vercel cron (`/api/cron/process-webhooks`)
// drains the queue and runs the pipeline.

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";

// Reject events whose entry.time is older than this. Captured signed
// payloads can otherwise be replayed indefinitely. 5 min is generous
// enough to accommodate Meta's own legitimate retry timing while still
// closing the long-tail replay window.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// ── GET: Webhook verification challenge ─────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  // Use timingSafeEqual to compare the verify token. The token isn't
  // particularly secret (it's set once in the Meta dev console), but the
  // free upgrade is worth taking.
  if (mode === "subscribe" && challenge && VERIFY_TOKEN && token) {
    const a = Buffer.from(token);
    const b = Buffer.from(VERIFY_TOKEN);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      console.log("[webhook/instagram] Verification challenge accepted");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface WebhookComment {
  id: string;
  text: string;
  timestamp?: number;
  from?: { id: string; username: string };
  media?: { id: string };
}

interface WebhookMessage {
  mid: string;
  text?: string;
  timestamp?: number;
}

interface WebhookMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: WebhookMessage;
}

interface WebhookChange {
  field: string;
  value: WebhookComment;
}

interface WebhookEntry {
  id: string;
  time: number;
  changes?: WebhookChange[];
  messaging?: WebhookMessaging[];
}

interface WebhookPayload {
  object: string;
  entry?: WebhookEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function lookupAppUser(igUserId: string): Promise<string | null> {
  const { data } = await db
    .from("platform_tokens")
    .select("user_id")
    .eq("platform", "instagram")
    .eq("platform_user_id", igUserId)
    .eq("status", "active")
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Returns true if the sender is a NEW conversation (never replied to). */
async function isNewConversation(
  userId: string,
  senderIgId: string,
  senderUsername: string | null,
): Promise<boolean> {
  const { data: existing } = await db
    .from("dm_conversations")
    .select("is_new")
    .eq("user_id", userId)
    .eq("sender_ig_id", senderIgId)
    .maybeSingle();

  if (existing) {
    return existing.is_new;
  }

  await db.from("dm_conversations").insert({
    user_id: userId,
    sender_ig_id: senderIgId,
    sender_username: senderUsername,
    is_new: true,
  });

  return true;
}

function isFresh(entryTimeSeconds: number | undefined): boolean {
  if (!entryTimeSeconds || typeof entryTimeSeconds !== "number") {
    // Missing timestamp → treat as suspicious; reject.
    return false;
  }
  const ageMs = Date.now() - entryTimeSeconds * 1000;
  // Allow up to 60s of clock skew in either direction.
  return ageMs >= -60_000 && ageMs <= REPLAY_WINDOW_MS;
}

// ── POST: Incoming webhook events ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Signature Verification ──────────────────────────────────────────────
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature || !META_APP_SECRET) {
    console.error("[webhook/instagram] Missing signature or app secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.text();

  const expectedSignature =
    "sha256=" +
    createHmac("sha256", META_APP_SECRET).update(rawBody).digest("hex");

  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (signatureBuffer.length !== expectedBuffer.length) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "instagram") {
    return NextResponse.json({ received: true });
  }

  let queued = 0;
  let duplicates = 0;
  let stale = 0;
  let skipped = 0;

  for (const entry of body.entry ?? []) {
    // ── Replay protection ────────────────────────────────────────────────
    // Reject the entire entry if its timestamp is outside the freshness
    // window. Meta groups multiple events under one `entry`, so they share
    // a timestamp; a stale signed payload fails here regardless of which
    // events it contains.
    if (!isFresh(entry.time)) {
      stale++;
      continue;
    }

    const igUserId = entry.id;
    const userId = await lookupAppUser(igUserId);
    if (!userId) {
      console.warn("[webhook/instagram] No active token for IG user:", igUserId);
      skipped++;
      continue;
    }

    // ── Comment events ───────────────────────────────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const comment = change.value;
      if (!comment?.id || !comment?.text) continue;

      const result = await enqueueWebhookEvent({
        platform: "instagram",
        eventId: `ig_comment_${comment.id}`,
        userId,
        payload: {
          platform: "instagram",
          contentType: "comment",
          externalId: comment.id,
          text: comment.text,
          authorHandle: comment.from?.username ?? "instagram_user",
          authorId: comment.from?.id ?? null,
          createdAt: comment.timestamp
            ? new Date(comment.timestamp * 1000).toISOString()
            : new Date(entry.time * 1000).toISOString(),
          rawData: {
            mediaId: comment.media?.id ?? null,
            from: comment.from ?? null,
            contentType: "comment",
            webhookTriggered: true,
            entryTime: entry.time,
          },
        },
      });

      if (result.duplicate) duplicates++;
      else if (result.enqueued) queued++;
    }

    // ── DM events (new conversations only) ──────────────────────────────
    for (const msg of entry.messaging ?? []) {
      // Only process incoming messages (sender is NOT the account owner)
      if (msg.sender.id === igUserId) continue;
      const message = msg.message;
      if (!message?.mid || !message?.text) continue;

      const senderIgId = msg.sender.id;
      // First-contact gating happens at webhook time so we don't queue
      // events from already-replied-to conversations. This is a quick
      // existence check — cheap relative to enqueueing.
      const isNew = await isNewConversation(userId, senderIgId, null);
      if (!isNew) {
        skipped++;
        continue;
      }

      const result = await enqueueWebhookEvent({
        platform: "instagram",
        eventId: `ig_dm_${message.mid}`,
        userId,
        payload: {
          platform: "instagram",
          contentType: "dm",
          externalId: `dm_${message.mid}`,
          text: message.text,
          authorHandle: `ig_user_${senderIgId}`,
          authorId: senderIgId,
          createdAt: msg.timestamp
            ? new Date(msg.timestamp * 1000).toISOString()
            : new Date(entry.time * 1000).toISOString(),
          rawData: {
            senderId: senderIgId,
            contentType: "dm",
            webhookTriggered: true,
            entryTime: entry.time,
          },
        },
      });

      if (result.duplicate) duplicates++;
      else if (result.enqueued) queued++;
    }
  }

  console.log(
    `[webhook/instagram] queued=${queued} duplicates=${duplicates} stale=${stale} skipped=${skipped}`,
  );
  return NextResponse.json({ received: true, queued, duplicates, stale, skipped });
}
