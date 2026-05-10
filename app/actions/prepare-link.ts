"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db/supabase";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";

const STATE_COOKIE = "whistle_link_state";
const STATE_TTL_SECONDS = 300; // 5 minutes — the OAuth round-trip should fit easily.

/**
 * Server action invoked from the Connect page immediately before the client
 * calls `signIn("twitter")` or `signIn("instagram")`.
 *
 * Generates a single-use, server-side state row in `oauth_link_states` and
 * sets a `whistle_link_state` cookie holding only that opaque UUID. The
 * NextAuth signIn callback consumes the cookie + state row to look up the
 * authenticated user's app-level UUID — without that row the callback
 * refuses to proceed. The user_id never travels client-side.
 *
 * SECURITY: The previous implementation set a `whistle_link_user_id`
 * cookie containing the public.users.id directly. The current design uses
 * a server-side state map so a forged/replayed cookie value fails the DB
 * lookup, states are single-use (deleted on consumption), TTL-bound, and
 * the user_id is never exposed to the browser.
 *
 * Throws if there's no active Supabase session — the client must redirect
 * to /login if this happens.
 */
export async function prepareLinkPlatform(
  platform: "twitter" | "instagram",
): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("not_authenticated");
  }

  // Insert the state row. The DB generates the UUID via DEFAULT gen_random_uuid().
  const { data, error } = await db
    .from("oauth_link_states")
    .insert({
      user_id: user.id,
      platform,
      // expires_at uses the table default (now() + interval '5 minutes')
    })
    .select("state")
    .single();

  if (error || !data?.state) {
    console.error("[prepare-link] Failed to create oauth_link_state:", error?.message);
    throw new Error("link_state_create_failed");
  }

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, data.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
    path: "/",
  });
}
