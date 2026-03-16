"use server";

import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";

/**
 * Call this server action immediately before triggering signIn() for a second
 * platform. It reads the current Supabase Auth session and stores the user's
 * existing app UUID in a short-lived HTTP-only cookie so that the NextAuth
 * signIn callback can read it and link the new platform token to the existing
 * user instead of creating a new one.
 *
 * Why: NextAuth v5 does NOT pass the existing session JWT to the jwt callback
 * during an OAuth sign-in — token starts empty every time. Cookies are the
 * only mechanism that reliably survives the OAuth redirect round-trip.
 */
export async function prepareLinkPlatform(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.id) return;

  const cookieStore = await cookies();
  cookieStore.set("whistle_link_user_id", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300, // 5 minutes — more than enough for the OAuth round-trip
    path: "/",
  });
}
