"use server";

import { cookies } from "next/headers";
import { auth } from "@/auth";

/**
 * Call this server action immediately before triggering signIn() for a second
 * platform. It reads the current session and stores the user's existing Supabase
 * UUID in a short-lived HTTP-only cookie so that the NextAuth signIn callback
 * can read it and link the new platform to the existing user instead of
 * creating a new one.
 *
 * Why: NextAuth v5 does NOT pass the existing session JWT to the jwt callback
 * during an OAuth sign-in — token starts empty every time. Cookies are the
 * only mechanism that reliably survives the OAuth redirect round-trip.
 */
export async function prepareLinkPlatform(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  const cookieStore = await cookies();
  cookieStore.set("whistle_link_user_id", session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300, // 5 minutes — more than enough for the OAuth round-trip
    path: "/",
  });
}
