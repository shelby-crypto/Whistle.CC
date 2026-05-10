import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/supabase";

/**
 * Supabase Auth callback handler.
 *
 * After a user verifies their OTP or clicks a magic link, Supabase redirects
 * here with a `code` query param. We exchange the code for a session, then
 * ensure the user has a row in our `users` table (creating one if needed).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // SECURITY: `next` is attacker-controlled. Earlier versions fed it
  // directly into `NextResponse.redirect(new URL(next, request.url))`,
  // which made `?next=https://evil.example` a working open-redirect — an
  // attacker could craft a login link, the user would authenticate, and
  // the freshly-cookied browser would be bounced off-domain.
  //
  // Only accept relative path-only redirects: must start with a single
  // `/` (rejects scheme-relative `//evil.example`) and must not contain
  // `://` anywhere (rejects `/foo?bar=://evil` and similar curiosities).
  // Anything else collapses to "/".
  const rawNext = searchParams.get("next");
  const next =
    rawNext &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.includes("://") &&
    !rawNext.includes("\\")
      ? rawNext
      : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  );

  // Exchange the auth code for a session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("[auth/callback] Code exchange failed:", error?.message);
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  const authUser = data.session.user;

  // Ensure the user has a row in our public.users table
  // Look up by auth_id first, then create if missing
  const { data: existingUser } = await db
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  if (!existingUser) {
    const { error: insertError } = await db.from("users").insert({
      auth_id: authUser.id,
      email: authUser.email ?? authUser.phone ?? null,
      name: authUser.user_metadata?.name ?? null,
    });

    if (insertError) {
      console.error("[auth/callback] Failed to create user row:", insertError.message);
      // Don't block login — the user is authenticated, just missing the app row
    }
  }

  // Set the session in a cookie so the browser client picks it up
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  const response = NextResponse.redirect(new URL(next, request.url));

  response.cookies.set(cookieName, JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: {
      id: authUser.id,
      email: authUser.email,
      phone: authUser.phone,
    },
  }), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
