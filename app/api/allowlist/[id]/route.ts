import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

// ── DELETE /api/allowlist/[id] ───────────────────────────────────────────────
// Remove a single entry from the allowlist.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await db
    .from("allowlisted_authors")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id); // RLS safety: only delete own entries

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
