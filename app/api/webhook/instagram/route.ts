import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/supabase";
import { processContentItem, contentExists } from "@/lib/polling/poller";

// ── Instagram Webhook Handler ───────────────────────────────────────────────
// Receives real-time comment notifications from Meta's webhook system.
//
// GET  → Verification challenge (Meta sends this once when you register the webhook)
// POST → Incoming events (comment created, etc.)
//
// Flow: Meta pushes event → we look up which app user owns the IG account →
//       fetch the comment text → run it through the moderation pipeline.

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";

// ── GET: Webhook verification challenge ─────────────────────────────────────
// Meta sends: GET ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
// We must return the challenge value if the token matches.

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

// ── POST: Incoming webhook events ───────────────────────────────────────────

interface WebhookComment {
  id: string;
  text: string;
  timestamp?: number;
  from?: { id: string; username: string };
  media?: { id: string };
}

interface WebhookChange {
  field: string;
  value: WebhookComment;
}

interface WebhookEntry {
  id: string; // Instagram user ID that owns the media
  time: number;
  changes?: WebhookChange[];
}

interface WebhookPayload {
  object: string;
  entry?: WebhookEntry[];
}

export async function POST(req: NextRequest) {
  // Meta expects a 200 response quickly — process async
  // But for our use case, processing is fast enough to do inline.

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle Instagram comments
  if (body.object !== "instagram") {
    return NextResponse.json({ received: true });
  }

  const errors: string[] = [];
  let processed = 0;

  for (const entry of body.entry ?? []) {
    const igUserId = entry.id; // The IG account that received the comment

    // Look up which app user owns this Instagram account
    const { data: tokenRow } = await db
      .from("platform_tokens")
      .select("user_id")
      .eq("platform", "instagram")
      .eq("platform_user_id", igUserId)
      .eq("status", "active")
      .maybeSingle();

    if (!tokenRow) {
      console.warn("[webhook/instagram] No active token found for IG user:", igUserId);
      continue;
    }

    const userId = tokenRow.user_id;

    for (const change of entry.changes ?? []) {
      // We only care about comment events
      if (change.field !== "comments") continue;

      const comment = change.value;
      if (!comment?.id || !comment?.text) continue;

      // Skip if we've already processed this comment (deduplication)
      if (await contentExists("instagram", comment.id)) continue;

      try {
        const ok = await processContentItem({
          userId,
          platform: "instagram",
          externalId: comment.id,
          text: comment.text,
          authorHandle: comment.from?.username ?? "instagram_user",
          authorId: null, // Instagram doesn't provide commenter user IDs for moderation
          createdAt: comment.timestamp
            ? new Date(comment.timestamp * 1000).toISOString()
            : new Date().toISOString(),
          rawData: {
            mediaId: comment.media?.id ?? null,
            from: comment.from ?? null,
            webhookTriggered: true,
          },
          errors,
        });

        if (ok) processed++;
      } catch (err) {
        console.error("[webhook/instagram] Error processing comment:", comment.id, err);
        errors.push(`Comment ${comment.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(`[webhook/instagram] Processed ${processed} comments, ${errors.length} errors`);

  // Meta requires a 200 response — anything else triggers retries
  return NextResponse.json({ received: true, processed, errors: errors.length });
}
