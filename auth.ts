import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { cookies } from "next/headers";
import { db } from "@/lib/db/supabase";
import { encryptTokenForStorage } from "@/lib/db/encrypt";

const IG_GRAPH = "https://graph.instagram.com";

// ── Instagram short-lived → long-lived token exchange (60 days) ────────────
// Instagram Login issues short-lived tokens (1 hour). Exchange for long-lived
// (60 days) using the ig_exchange_token grant type.
async function exchangeInstagramToken(shortLivedToken: string): Promise<{
  access_token: string;
  expires_in?: number;
} | null> {
  try {
    const url = new URL(`${IG_GRAPH}/access_token`);
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    url.searchParams.set("access_token", shortLivedToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[auth] IG token exchange failed:", await res.text());
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

// ── Upsert user + store encrypted platform token in Supabase ──────────────
// Returns the Supabase user UUID on success, null on any failure.
async function upsertUserAndToken(params: {
  email: string | null;
  name: string | null;
  platform: "twitter" | "instagram";
  platformUserId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  // When the user is already signed in with another platform, pass their
  // existing Supabase UUID here so we link the new token to the same user
  // rather than creating a new one.
  existingUserId?: string | null;
}): Promise<string | null> {
  // ── 1. Resolve the Supabase user UUID ────────────────────────────────────
  let userId: string | null = null;

  if (params.existingUserId) {
    // Linking a second platform to an already-authenticated user.
    // Skip all user-creation logic — just use the existing UUID.
    userId = params.existingUserId;
    if (params.name) {
      await db.from("users").update({ name: params.name }).eq("id", userId);
    }
  } else if (params.email) {
    const { data: user, error } = await db
      .from("users")
      .upsert(
        { email: params.email, name: params.name },
        { onConflict: "email", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (error || !user) {
      console.error("[auth] Failed to upsert user by email:", error?.message);
      return null;
    }
    userId = user.id;
  } else {
    // No email (Twitter / Instagram) — look up by existing platform token
    const { data: existing } = await db
      .from("platform_tokens")
      .select("user_id")
      .eq("platform", params.platform)
      .eq("platform_user_id", params.platformUserId)
      .maybeSingle();

    if (existing?.user_id) {
      userId = existing.user_id;
      await db.from("users").update({ name: params.name }).eq("id", userId);
    } else {
      const { data: newUser, error } = await db
        .from("users")
        .insert({ email: null, name: params.name })
        .select("id")
        .single();

      if (error || !newUser) {
        console.error("[auth] Failed to create user:", error?.message);
        return null;
      }
      userId = newUser.id;
    }
  }

  // ── 2. Encrypt and store the platform token ───────────────────────────────
  const accessEncrypted = encryptTokenForStorage(params.accessToken);
  const refreshEncrypted = params.refreshToken
    ? encryptTokenForStorage(params.refreshToken)
    : null;

  const { error: tokenError } = await db.from("platform_tokens").upsert(
    {
      user_id: userId,
      platform: params.platform,
      platform_user_id: params.platformUserId,
      platform_username: params.platformUsername,
      access_token_encrypted: accessEncrypted,
      refresh_token_encrypted: refreshEncrypted,
      expires_at: params.expiresAt?.toISOString() ?? null,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform" }
  );

  if (tokenError) {
    console.error("[auth] Failed to upsert platform token:", tokenError.message);
    return null;
  }

  return userId;
}

export const authConfig: NextAuthConfig = {
  providers: [
    // ── Twitter/X OAuth 2.0 with PKCE ──────────────────────────────────────
    {
      id: "twitter",
      name: "Twitter",
      type: "oauth",
      authorization: {
        url: "https://twitter.com/i/oauth2/authorize",
        params: {
          scope: "tweet.read tweet.write users.read offline.access",
          code_challenge_method: "S256",
        },
      },
      token: "https://api.twitter.com/2/oauth2/token",
      userinfo: "https://api.twitter.com/2/users/me",
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          id: profile.data?.id ?? profile.id,
          name: profile.data?.name ?? profile.name,
          email: null,
          image: null,
        };
      },
    },
    // ── Instagram via Business Login for Instagram ──────────────────────────
    // Uses the "Instagram API with Instagram Login" path — does NOT require a
    // Facebook Page. Authenticates directly against api.instagram.com and uses
    // graph.instagram.com for all subsequent API calls.
    {
      id: "instagram",
      name: "Instagram",
      type: "oauth",
      authorization: {
        url: "https://api.instagram.com/oauth/authorize",
        params: {
          scope: "instagram_business_basic,instagram_business_manage_comments",
        },
      },
      token: {
        url: "https://api.instagram.com/oauth/access_token",
        // Instagram's token response can include non-standard fields (e.g. scope as an
        // array, or a top-level permissions array) that oauth4webapi rejects.
        // conform() runs BEFORE oauth4webapi parses the response — we use it to
        // (a) log the raw body so we can see exactly what Instagram returns, and
        // (b) normalize any non-RFC-compliant fields so oauth4webapi doesn't throw.
        async conform(response: Response): Promise<Response | undefined> {
          let json: Record<string, unknown> = {};
          try {
            json = await response.clone().json();
          } catch {
            console.error("[auth] Instagram token response is not JSON, status:", response.status);
            return undefined;
          }
          // Instagram's Business Login API omits `token_type` and uses `permissions`
          // (array) instead of `scope` (string). oauth4webapi requires both fields to
          // be RFC 6749-compliant or it throws — which surfaces as "Configuration".
          // We normalize here before oauth4webapi touches the response.
          const needsFix =
            !json.token_type ||                  // missing required field
            Array.isArray(json.scope) ||         // scope must be a string if present
            Array.isArray(json.permissions);     // permissions array is non-standard

          if (!needsFix) return undefined;

          const fixed: Record<string, unknown> = {
            ...json,
            // Inject missing token_type
            token_type: json.token_type ?? "bearer",
            // Convert scope array → space-separated string
            ...(Array.isArray(json.scope) && { scope: (json.scope as string[]).join(" ") }),
            // Convert permissions array → scope string if scope is absent
            ...(Array.isArray(json.permissions) &&
              !json.scope && { scope: (json.permissions as string[]).join(" ") }),
          };
          // Remove the non-standard permissions array so oauth4webapi doesn't stumble
          delete fixed.permissions;

          return new Response(JSON.stringify(fixed), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
      // Instagram's token endpoint requires credentials in the POST body, not in an
      // Authorization: Basic header (which is the OAuth2 default). Setting this to
      // client_secret_post puts client_id + client_secret in the form-encoded body.
      client: { token_endpoint_auth_method: "client_secret_post" },
      // Instagram Graph API requires the token as a query param, not a Bearer header.
      // NextAuth's default userinfo string sends "Authorization: Bearer", which returns
      // an error — so we use a custom request function instead.
      // NOTE: `url` must be present here to satisfy @auth/core's assertConfig() validator
      // (assert.js checks `!u?.url` on the raw provider config). The `request` function
      // takes precedence at runtime, so the URL is never actually fetched directly.
      userinfo: {
        url: `${IG_GRAPH}/me`,
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const url = new URL(`${IG_GRAPH}/me`);
          url.searchParams.set("fields", "id,username");
          url.searchParams.set("access_token", tokens.access_token ?? "");
          const res = await fetch(url.toString());
          if (!res.ok) {
            const body = await res.text();
            console.error("[auth] Instagram userinfo failed:", body);
            throw new Error(`Instagram userinfo error: ${body}`);
          }
          return res.json() as Promise<{ id: string; username: string }>;
        },
      },
      clientId: process.env.META_APP_ID,
      clientSecret: process.env.META_APP_SECRET,
      checks: ["state"],
      profile(profile) {
        return {
          id: profile.id,
          name: profile.username,
          email: null,
          image: null,
        };
      },
    },
  ],

  session: { strategy: "jwt" },

  // NextAuth v5 reads AUTH_SECRET; fall back to NEXTAUTH_SECRET for compatibility.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  // Required when running behind a reverse proxy (Cloudflare Tunnel, nginx, etc.)
  // Tells NextAuth to trust X-Forwarded-Host headers so it can correctly
  // determine the public URL for OAuth redirects.
  trustHost: true,

  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account) return false;

      try {
        // Read the linking cookie set by prepareLinkPlatform() server action.
        // This is how we pass the existing user's UUID across the OAuth redirect
        // round-trip — NextAuth v5 does NOT carry the existing JWT into the
        // jwt callback during a new sign-in, so cookies are the only option.
        const cookieStore = await cookies();
        const existingUserId = cookieStore.get("whistle_link_user_id")?.value ?? null;
        if (existingUserId) {
          cookieStore.delete("whistle_link_user_id");
        }

        const platform = account.provider as "twitter" | "instagram";
        const accessToken = account.access_token ?? "";
        let finalAccessToken = accessToken;
        let expiresAt: Date | null = null;
        let platformUserId = "";
        let platformUsername = "";

        if (platform === "instagram") {
          // Exchange short-lived Instagram token for long-lived (60 days).
          // Instagram Login issues 1-hour tokens; ig_exchange_token extends to 60 days.
          // Block sign-in entirely if exchange fails — storing a 1-hour token
          // would cause immediate auth failures after the first poll cycle.
          const longLived = await exchangeInstagramToken(accessToken);
          if (!longLived) {
            console.error("[auth] Instagram token exchange failed — blocking sign-in");
            return false;
          }
          finalAccessToken = longLived.access_token;
          expiresAt = new Date(
            Date.now() + (longLived.expires_in ?? 5184000) * 1000
          );
          // Profile fields come from graph.instagram.com/me?fields=id,username
          const rawProfile = profile as Record<string, unknown>;
          platformUserId = (rawProfile?.id as string) ?? "";
          platformUsername = (rawProfile?.username as string) ?? user.name ?? "";
        } else {
          // Twitter — platform user info comes from the OAuth profile
          if (account.expires_at) {
            expiresAt = new Date(account.expires_at * 1000);
          }
          const rawProfile = profile as Record<string, unknown>;
          const profileData = rawProfile?.data as Record<string, unknown> | undefined;

          // Try to get platformUserId from profile first
          const profileId = (profileData?.id as string) ?? (rawProfile?.id as string) ?? "";
          const isValidTwitterId = /^\d+$/.test(profileId); // Twitter IDs are always numeric

          if (isValidTwitterId) {
            platformUserId = profileId;
            platformUsername =
              (profileData?.username as string) ??
              (rawProfile?.username as string) ??
              user.name ??
              "";
            console.log("[auth] Twitter platformUserId from profile:", platformUserId);
          } else {
            // Profile was missing or returned an error (e.g. 503 from Twitter's userinfo endpoint)
            // Retry /users/me up to 3 times before giving up
            console.warn("[auth] Twitter profile missing valid ID, fetching /users/me directly...");
            let fetchedValidId = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                if (attempt > 1) await new Promise((r) => setTimeout(r, attempt * 1000));
                const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
                  headers: { Authorization: `Bearer ${account.access_token}` },
                });
                if (meRes.ok) {
                  const meData = await meRes.json() as { data?: { id: string; username: string; name: string } };
                  const resolvedId = meData.data?.id ?? "";
                  if (/^\d+$/.test(resolvedId)) {
                    platformUserId = resolvedId;
                    platformUsername = meData.data?.username ?? user.name ?? "";
                    console.log(`[auth] Twitter platformUserId from /users/me (attempt ${attempt}):`, platformUserId);
                    fetchedValidId = true;
                    break;
                  }
                } else {
                  const errText = await meRes.text().catch(() => "");
                  console.warn(`[auth] Twitter /users/me attempt ${attempt} failed, status: ${meRes.status}`, errText);
                  // 401/403 = bad credentials/permissions — hard block
                  if (meRes.status === 401 || meRes.status === 403) {
                    console.error("[auth] Twitter sign-in blocked — credential/permission error:", meRes.status);
                    return false;
                  }
                  // 503 = transient server error — allow through after retries
                }
              } catch (err) {
                console.warn(`[auth] Twitter /users/me attempt ${attempt} threw:`, err);
              }
            }

            if (!fetchedValidId) {
              // Twitter's API is temporarily unavailable — allow sign-in but mention fetching
              // will be skipped until the token is reconnected when Twitter recovers.
              console.warn("[auth] Twitter /users/me unavailable after 3 attempts — signing in with empty platformUserId");
              platformUserId = "";
              platformUsername = user.name ?? "";
            }
          }
        }

        const supabaseId = await upsertUserAndToken({
          email: user.email ?? null,
          name: user.name ?? null,
          platform,
          platformUserId,
          platformUsername,
          accessToken: finalAccessToken,
          refreshToken: account.refresh_token ?? null,
          expiresAt,
          existingUserId,
        });

        if (!supabaseId) {
          console.error("[auth] upsertUserAndToken returned null — blocking sign-in");
          return false;
        }

        // Replace the platform user ID with the Supabase UUID so
        // token.id (and session.user.id) is the internal UUID, not
        // the platform's own identifier.
        user.id = supabaseId;
        return true;
      } catch (err) {
        console.error("[auth] signIn callback error:", err);
        return false;
      }
    },

    async jwt({ token, user }) {
      // Account linking is handled in the signIn callback via a linking cookie.
      // By the time jwt runs, user.id is already the correct Supabase UUID
      // (either the existing user if linking, or a freshly created one).
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/connect",   // OAuth account linking happens from the Connect page
    error: "/auth/error",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
