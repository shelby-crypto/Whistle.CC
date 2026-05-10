import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";
import { decryptTokenFromStorage } from "@/lib/db/encrypt";
// P1-22: opt every mutating/state-bearing API route out of static
// optimization and onto the Node runtime so writes are never cached or
// silently routed to the edge runtime where the Supabase client misbehaves.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/fix-twitter-id
// Retries the Twitter /users/me call using the stored access token and patches
// platform_user_id + platform_username in Supabase. Useful when the initial
// OAuth connect failed due to Twitter's /users/me returning 503.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Fetch the stored Twitter token row
  const { data: row, error: rowErr } = await db
    .from("platform_tokens")
    .select("access_token_encrypted, platform_user_id")
    .eq("user_id", userId)
    .eq("platform", "twitter")
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ error: "No Twitter token found — connect Twitter first" }, { status: 404 });
  }

  if (row.platform_user_id) {
    return NextResponse.json({ ok: true, message: "platformUserId already set", platformUserId: row.platform_user_id });
  }

  // Decrypt the stored access token
  let accessToken: string;
  try {
    accessToken = decryptTokenFromStorage(row.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt stored token" }, { status: 500 });
  }

  // Retry /users/me up to 5 times with exponential backoff
  const delays = [0, 1000, 2000, 4000, 8000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }

    try {
      const res = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const body = await res.json() as { data?: { id: string; username: string } };
        const id = body.data?.id ?? "";
        const username = body.data?.username ?? "";

        if (/^\d+$/.test(id)) {
          // Patch the row in Supabase
          const { error: updateErr } = await db
            .from("platform_tokens")
            .update({
              platform_user_id: id,
              platform_username: username,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("platform", "twitter");

          if (updateErr) {
            return NextResponse.json({ error: "DB update failed: " + updateErr.message }, { status: 500 });
          }

          // PRIVACY: don't log the Twitter username or the Supabase user UUID.
          // A success counter is enough to confirm the route fired.
          console.log("[fix-twitter-id] Patched platformUserId for caller");
          return NextResponse.json({ ok: true, platformUserId: id, username });
        }
      } else {
        console.warn(`[fix-twitter-id] attempt ${attempt + 1} failed: ${res.status}`);
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json({ error: `Twitter rejected token (${res.status}) — reconnect Twitter` }, { status: 400 });
        }
        // 503 = transient, keep retrying
      }
    } catch (err) {
      console.warn(`[fix-twitter-id] attempt ${attempt + 1} threw:`, err);
    }
  }

  return NextResponse.json(
    { error: "Twitter /users/me unavailable after 5 attempts. Try again in a few minutes or update Supabase manually." },
    { status: 503 }
  );
}
