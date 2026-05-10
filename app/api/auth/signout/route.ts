import { NextResponse } from "next/server";
// P1-22: opt every mutating/state-bearing API route out of static
// optimization and onto the Node runtime so writes are never cached or
// silently routed to the edge runtime where the Supabase client misbehaves.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
