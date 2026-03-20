import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/set-session
 *
 * Called from the login page after successful OTP verification.
 * Stores the Supabase Auth session in an HTTP-only cookie so that
 * the server-side middleware can read it on subsequent requests.
 *
 * The Supabase browser client stores sessions in localStorage, but
 * Next.js middleware runs on the edge and can only read cookies —
 * this endpoint bridges the two.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Origin Validation ───────────────────────────────────────────────
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");

    // Build expected origin from NEXT_PUBLIC_APP_URL, or construct from Host header
    let expectedOrigin = process.env.NEXT_PUBLIC_APP_URL;
    if (!expectedOrigin) {
      const host = request.headers.get("host");
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
      expectedOrigin = host ? `${protocol}://${host}` : "http://localhost:3000";
    }

    // Check that request comes from the same origin
    if (origin && origin !== expectedOrigin) {
      console.warn("[set-session] Origin mismatch:", origin, "vs", expectedOrigin);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (referer) {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== expectedOrigin) {
        console.warn("[set-session] Referer mismatch:", refererOrigin, "vs", expectedOrigin);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const session = await request.json();

    if (!session?.access_token) {
      return NextResponse.json({ error: "Missing session data" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;

    const response = NextResponse.json({ ok: true });

    response.cookies.set(cookieName, JSON.stringify(session), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
