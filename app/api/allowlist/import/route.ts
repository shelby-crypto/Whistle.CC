import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";

const ALLOWLIST_LIMIT = 500;

// ── POST /api/allowlist/import ───────────────────────────────────────────────
// Bulk import allowlist entries from CSV upload.
// Expected CSV columns: platform, username, note (optional)

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const lines = csvText.split("\n").map((line) => line.trim()).filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // Parse header
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const platformIdx = header.indexOf("platform");
    const usernameIdx = header.indexOf("username");
    const noteIdx = header.indexOf("note");

    if (platformIdx === -1 || usernameIdx === -1) {
      return NextResponse.json(
        { error: "CSV must have 'platform' and 'username' columns" },
        { status: 400 }
      );
    }

    // Parse rows
    const rowErrors: Array<{ row: number; error: string }> = [];
    const validRows: Array<{
      user_id: string;
      platform: string;
      platform_username: string;
      note: string | null;
      added_by: string | null;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const platform = cols[platformIdx]?.toLowerCase();
      const username = cols[usernameIdx]?.replace(/^@/, "");
      const note = noteIdx !== -1 ? cols[noteIdx] || null : null;

      if (!platform || !username) {
        rowErrors.push({ row: i + 1, error: "Missing platform or username" });
        continue;
      }

      if (!["twitter", "instagram"].includes(platform)) {
        rowErrors.push({ row: i + 1, error: `Invalid platform: ${platform}` });
        continue;
      }

      validRows.push({
        user_id: user.id,
        platform,
        platform_username: username,
        note,
        added_by: user.email,
      });
    }

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV", rowErrors },
        { status: 400 }
      );
    }

    // Check capacity
    const { count: currentCount, error: countError } = await db
      .from("allowlisted_authors")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const remaining = ALLOWLIST_LIMIT - (currentCount ?? 0);
    if (validRows.length > remaining) {
      return NextResponse.json(
        {
          error: `Import would add ${validRows.length} entries, but you only have ${remaining} slots available (${ALLOWLIST_LIMIT} max).`,
        },
        { status: 409 }
      );
    }

    // Batch insert — use upsert to skip duplicates
    const { data, error } = await db
      .from("allowlisted_authors")
      .upsert(validRows, {
        onConflict: "user_id,platform,platform_username",
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const imported = data?.length ?? 0;
    const skippedDuplicates = validRows.length - imported;

    return NextResponse.json({
      imported,
      skipped_duplicates: skippedDuplicates,
      errors: rowErrors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process CSV" },
      { status: 500 }
    );
  }
}
