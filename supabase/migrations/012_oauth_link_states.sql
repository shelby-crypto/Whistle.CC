-- ============================================================================
-- Migration 012: Server-side state map for OAuth platform-linking flows
--
-- BACKGROUND
-- When a Supabase-authenticated user clicks "Connect Twitter" or "Connect
-- Instagram", we need to carry their app-level user_id across the OAuth
-- redirect round-trip so the NextAuth signIn callback can link the new
-- platform token to the right `users` row.
--
-- The previous implementation used a single httpOnly cookie
-- (`whistle_link_user_id`) that held the user_id in plaintext. That
-- approach was secure-ish (httpOnly + 5-min TTL + only set by an
-- authenticated server action), but it allowed a stale linking cookie
-- from a previous session to silently link the OAuth grant to the wrong
-- account, and it leaked the public.users.id into the browser.
--
-- THIS MIGRATION
-- Creates a server-side state table. The flow becomes:
--
--   1. User clicks "Connect <platform>".
--   2. `prepareLinkPlatform()` server action:
--        a. Verifies the active Supabase session.
--        b. Generates a UUID `state`.
--        c. INSERTs (state, user_id, platform, expires_at) into this table.
--        d. Sets a `whistle_link_state` cookie holding only the UUID.
--   3. NextAuth redirects through the OAuth provider.
--   4. The provider redirects back; NextAuth's signIn callback:
--        a. Reads the `whistle_link_state` cookie.
--        b. SELECTs + DELETEs the matching row (single-use).
--        c. Validates `expires_at > now()` and `platform` matches.
--        d. Uses the row's `user_id` as the existing-user ID.
--
-- Properties this provides over the old cookie:
--   - The user_id never travels client-side.
--   - States are single-use (DELETE is part of consumption).
--   - States are TTL-bound (default 5 min, enforced by check in app code +
--     a daily cleanup CTE — Postgres has no built-in TTL).
--   - A forged or replayed cookie value fails the lookup.
--   - Stale states from previous sessions cannot accidentally link OAuth
--     grants to a wrong/unrelated user — the row is deleted on first use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_link_states (
  state       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    TEXT        NOT NULL CHECK (platform IN ('twitter', 'instagram')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- ── Index for the cleanup query ─────────────────────────────────────────────
-- We periodically prune expired states. expires_at is the natural sort key.
CREATE INDEX IF NOT EXISTS idx_oauth_link_states_expires_at
  ON oauth_link_states (expires_at);

-- ── Service-role-only access ────────────────────────────────────────────────
-- This table is touched only by the prepareLinkPlatform server action and
-- the NextAuth signIn callback — both run on the server with the service
-- role. Browser clients have no business reading it.
ALTER TABLE oauth_link_states ENABLE ROW LEVEL SECURITY;

-- (No CREATE POLICY — RLS-on-with-no-policy denies all anon/authenticated
-- access, leaving only service_role.)

-- ── Convenience helper: prune expired rows ──────────────────────────────────
-- Call from a cron job, or run inline at low volume. Idempotent.
CREATE OR REPLACE FUNCTION prune_expired_oauth_link_states()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_link_states WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
