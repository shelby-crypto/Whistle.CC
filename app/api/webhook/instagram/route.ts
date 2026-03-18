import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { processContentItem, contentExists } from "@/lib/polling/poller";

// ── Instagram Webhook Handler ───────────────────────────────────────────────
// Receives real-time notifications from Meta's webhook system:
//   - Comments on posts  → processed through moderation pipeline
//   - DMs (new conversations only) → scanned + sender restricted if harmful
//
// GET  → Verification challenge (Meta sends this once when you register)
// POST → Incoming events

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";

// ── GET: Webhook verification challenge ─────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    console.log("[webhook/instagram] Verification challenge accepted");
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
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
  mid: string;          // Message ID
  text?: string;        // Message text (may be absent for media messages)
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
async function isNewConversation(userId: string, senderIgId: string, senderUsername: string | null): Promise<boolean> {
  // Check if we've seen this sender before
  const { data: existing } = await db
    .from("dm_conversations")
    .select("is_new")
    .eq("user_id", userId)
    .eq("sender_ig_id", senderIgId)
    .maybeSingle();

  if (existing) {
    // Already tracked — return whether it's still new (user hasn't replied)
    return existing.is_new;
  }

  // First time seeing this sender — insert as new conversation
  await db.from("dm_conversations").insert({
    user_id: userId,
    sender_ig_id: senderIgId,
    sender_username: senderUsername,
    is_new: true,
  });

  return true;
}

// ── POST: Incoming webhook events ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "instagram") {
    return NextResponse.json({ received: true });
  }

  const errors: string[] = [];
  let commentsProcessed = 0;
  let dmsProcessed = 0;

  for (const entry of body.entry ?? []) {
    const igUserId = entry.id;

    const userId = await lookupAppUser(igUserId);
    if (!userId) {
      console.warn("[webhook/instagram] No active token for IG user:", igUserId);
      continue;
    }

    // ── Handle comment events ────────────────────────────────────────────
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;

      const comment = change.value;
      if (!comment?.id || !comment?.text) continue;
      if (await contentExists("instagram", comment.id)) continue;

      try {
        const ok = await processContentItem({
          userId,
          platform: "instagram",
          externalId: comment.id,
          text: comment.text,
          authorHandle: comment.from?.username ?? "instagram_user",
          authorId: null,
          createdAt: comment.timestamp
            ? new Date(comment.timestamp * 1000).toISOString()
            : new Date().toISOString(),
          rawData: {
            mediaId: comment.media?.id ?? null,
            from: comment.from ?? null,
            contentType: "comment",
            webhookTriggered: true,
          },
          errors,
        });
        if (ok) commentsProcessed++;
      } catch (err) {
        console.error("[webhook/instagram] Comment error:", comment.id, err);
        errors.push(`Comment ${comment.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Handle DM events (new conversations only) ────────────────────────
    for (const msg of entry.messaging ?? []) {
      // Only process incoming messages (sender is NOT the account owner)
      if (msg.sender.id === igUserId) continue;

      const message = msg.message;
      if (!message?.mid || !message?.text) continue;

      // Deduplicate
      if (await contentExists("instagram", `dm_${message.mid}`)) continue;

      const senderIgId = msg.sender.id;

      // Only scan if this is a new/first-contact conversation
      const isNew = await isNewConversation(userId, senderIgId, null);
      if (!isNew) {
        console.log("[webhook/instagram] Skipping DM from known sender:", senderIgId);
        continue;
      }

      try {
        const ok = await processContentItem({
          userId,
          platform: "instagram",
          externalId: `dm_${message.mid}`,
          text: message.text,
          authorHandle: `ig_user_${senderIgId}`,
          authorId: senderIgId,
          createdAt: msg.timestamp
            ? new Date(msg.timestamp * 1000).toISOString()
            : new Date().toISOString(),
          rawData: {
            senderId: senderIgId,
            contentType: "dm",
            webhookTriggered: true,
          },
          errors,
          contentType: "dm",
        });
        if (ok) dmsProcessed++;
      } catch (err) {
        console.error("[webhook/instagram] DM error:", message.mid, err);
        errors.push(`DM ${message.mid}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(`[webhook/instagram] Comments: ${commentsProcessed}, DMs: ${dmsProcessed}, Errors: ${errors.length}`);
  return NextResponse.json({ received: true, commentsProcessed, dmsProcessed, errors: errors.length });
}
