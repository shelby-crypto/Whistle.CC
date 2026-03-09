import { db } from "@/lib/db/supabase";
import { encryptTokenForStorage, decryptTokenFromStorage } from "@/lib/db/encrypt";

// ── Types ──────────────────────────────────────────────────────────────────

export type Platform = "twitter" | "instagram";

interface TokenRow {
  user_id: string;
  platform: Platform;
  platform_user_id: string;
  platform_username: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  status: string;
}

export interface ActiveToken {
  accessToken: string;
  platformUserId: string;
  platformUsername: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
}

export async function markTokenExpired(userId: string, platform: Platform): Promise<void> {
  await db
    .from("platform_tokens")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("platform", platform);
}

// ── Twitter token refresh ──────────────────────────────────────────────────

export async function refreshTwitterToken(userId: string): Promise<string | null> {
  const { data: row } = await db
    .from("platform_tokens")
    .select("refresh_token_encrypted")
    .eq("user_id", userId)
    .eq("platform", "twitter")
    .eq("status", "active")
    .maybeSingle<Pick<TokenRow, "refresh_token_encrypted">>();

  if (!row?.refresh_token_encrypted) {
    console.error("[token-service] Twitter refresh token not found for user:", userId);
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptTokenFromStorage(row.refresh_token_encrypted);
  } catch {
    console.error("[token-service] Failed to decrypt Twitter refresh token for user:", userId);
    return null;
  }

  try {
    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString("base64");

    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      console.error("[token-service] Twitter refresh failed, status:", res.status);
      await markTokenExpired(userId, "twitter");
      return null;
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const newExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    await db
      .from("platform_tokens")
      .update({
        access_token_encrypted: encryptTokenForStorage(data.access_token),
        ...(data.refresh_token && {
          refresh_token_encrypted: encryptTokenForStorage(data.refresh_token),
        }),
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("platform", "twitter");

    return data.access_token;
  } catch (err) {
    console.error("[token-service] Twitter refresh threw:", err);
    await markTokenExpired(userId, "twitter");
    return null;
  }
}

// ── Instagram token refresh ────────────────────────────────────────────────

export async function refreshInstagramToken(userId: string): Promise<string | null> {
  const { data: row } = await db
    .from("platform_tokens")
    .select("access_token_encrypted")
    .eq("user_id", userId)
    .eq("platform", "instagram")
    .eq("status", "active")
    .maybeSingle<Pick<TokenRow, "access_token_encrypted">>();

  if (!row) {
    console.error("[token-service] Instagram token not found for user:", userId);
    return null;
  }

  let currentToken: string;
  try {
    currentToken = decryptTokenFromStorage(row.access_token_encrypted);
  } catch {
    console.error("[token-service] Failed to decrypt Instagram token for user:", userId);
    return null;
  }

  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", currentToken);

    const res = await fetch(url.toString());

    if (!res.ok) {
      console.error("[token-service] Instagram refresh failed, status:", res.status);
      await markTokenExpired(userId, "instagram");
      return null;
    }

    const data = await res.json() as { access_token: string; expires_in: number };

    await db
      .from("platform_tokens")
      .update({
        access_token_encrypted: encryptTokenForStorage(data.access_token),
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("platform", "instagram");

    return data.access_token;
  } catch (err) {
    console.error("[token-service] Instagram refresh threw:", err);
    await markTokenExpired(userId, "instagram");
    return null;
  }
}

// ── getActiveToken ─────────────────────────────────────────────────────────
// Returns token + platform metadata in a single query.
// Use this when you also need platformUserId (e.g. Twitter API calls that
// require the authenticated user's own Twitter ID).

export async function getActiveToken(
  userId: string,
  platform: Platform
): Promise<ActiveToken | null> {
  const { data: row } = await db
    .from("platform_tokens")
    .select("access_token_encrypted, platform_user_id, platform_username, expires_at")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("status", "active")
    .maybeSingle<Pick<TokenRow, "access_token_encrypted" | "platform_user_id" | "platform_username" | "expires_at">>();

  if (!row) return null;

  // Refresh proactively if expiring within 5 minutes
  if (isExpiringSoon(row.expires_at)) {
    const refreshed = platform === "twitter"
      ? await refreshTwitterToken(userId)
      : await refreshInstagramToken(userId);
    if (!refreshed) return null;
    return {
      accessToken: refreshed,
      platformUserId: row.platform_user_id,
      platformUsername: row.platform_username,
    };
  }

  try {
    return {
      accessToken: decryptTokenFromStorage(row.access_token_encrypted),
      platformUserId: row.platform_user_id,
      platformUsername: row.platform_username,
    };
  } catch {
    console.error("[token-service] Failed to decrypt token for user:", userId, "platform:", platform);
    return null;
  }
}

// ── getToken ───────────────────────────────────────────────────────────────
// Convenience wrapper — use getActiveToken if you also need platformUserId.

export async function getToken(userId: string, platform: Platform): Promise<string | null> {
  return (await getActiveToken(userId, platform))?.accessToken ?? null;
}

// ── revokeToken ────────────────────────────────────────────────────────────

export async function revokeToken(userId: string, platform: string): Promise<void> {
  await db
    .from("platform_tokens")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("platform", platform);
}
