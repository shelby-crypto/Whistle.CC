import { NextResponse } from "next/server";

/**
 * POST /api/auth/signout
 *
 * Clears the Supabase Auth session cookie and redirects to /login.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(cookieName);

  return response;
}
