import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth-helpers";
import { db } from "@/lib/db/supabase";
// P1-22: opt every mutating/state-bearing API route out of static
// optimization and onto the Node runtime so writes are never cached or
// silently routed to the edge runtime where the Supabase client misbehaves.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWLIST_LIMIT = 500;

// P1-19: minimal RFC-4180 CSV parser. Handles quoted fields, embedded
// commas, embedded newlines (within quoted fields), and escaped quotes
// ("" -> "). Not a full implementation — we don't preserve trailing
// whitespace inside fields the way some dialects do — but enough that an
// allowlist row like `twitter,"smith, j",my friend, the coach` no longer
// silently splits into the wrong number of columns.
function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    // Not in quotes
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      // Treat CR as harmless; the LF will close the row.
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      // Skip blank lines.
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Flush trailing field/row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }

  return rows;
}

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
    const allRows = parseCSV(csvText);

    if (allRows.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // Parse header
    const header = allRows[0].map((h) => h.trim().toLowerCase());
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

    for (let i = 1; i < allRows.length; i++) {
      const cols = allRows[i].map((c) => c.trim());
      const platform = cols[platformIdx]?.toLowerCase().trim();
      const username = cols[usernameIdx]?.trim().replace(/^@/, "");
      const note = noteIdx !== -1 ? (cols[noteIdx]?.trim() || null) : null;

      // Validate: both platform and username must be non-empty after trimming
      if (!platform || !username) {
        rowErrors.push({ row: i + 1, error: "Missing or empty platform or username" });
        continue;
      }

      if (!["twitter", "instagram"].includes(platform)) {
        rowErrors.push({ row: i + 1, error: `Invalid platform: ${platform}` });
        continue;
      }

      // Validate username length (prevent DOS / storage abuse)
      if (username.length > 255) {
        rowErrors.push({ row: i + 1, error: "Username too long (max 255 chars)" });
        continue;
      }

      // Validate note length (optional, but validate if present)
      if (note && note.length > 500) {
        rowErrors.push({ row: i + 1, error: "Note too long (max 500 chars)" });
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
