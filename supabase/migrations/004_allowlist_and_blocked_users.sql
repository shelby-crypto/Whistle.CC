-- Migration 004: Allowlist & Blocked Users
-- Adds allowlisted_authors table for explicit allowlist management
-- Adds reversed/reversed_at/reversed_by columns to platform_actions for unblock tracking

-- ── Allowlisted Authors ──────────────────────────────────────────────────────
-- Content from these users skips the moderation pipeline entirely.
-- Capped at 500 manual entries per user (enforced by trigger below).

CREATE TABLE allowlisted_authors (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL CHECK (platform IN ('twitter', 'instagram')),
  platform_user_id   TEXT,           -- platform's numeric/internal ID (preferred for matching)
  platform_username  TEXT NOT NULL,   -- human-readable handle (for display)
  note               TEXT,            -- optional reason, e.g. "teammate", "agent"
  added_by           TEXT,            -- who added this entry (email or name)
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, platform_username)
);

-- Index for fast lookup during polling (by platform user ID)
CREATE INDEX idx_allowlisted_authors_lookup
  ON allowlisted_authors(user_id, platform, platform_user_id);

-- Index for fallback lookup by handle
CREATE INDEX idx_allowlisted_authors_handle
  ON allowlisted_authors(user_id, platform, platform_username);

-- ── RLS: users can only see/manage their own allowlist ───────────────────────

ALTER TABLE allowlisted_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY allowlisted_authors_user_policy ON allowlisted_authors
  USING (user_id = current_app_user_id());

-- ── 500-entry cap trigger ────────────────────────────────────────────────────
-- Application layer enforces this too, but this is a safety net.

CREATE OR REPLACE FUNCTION check_allowlist_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM allowlisted_authors WHERE user_id = NEW.user_id) >= 500 THEN
    RAISE EXCEPTION 'Allowlist limit of 500 entries reached for this user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_allowlist_limit
  BEFORE INSERT ON allowlisted_authors
  FOR EACH ROW EXECUTE FUNCTION check_allowlist_limit();

-- ── Blocked Users: track unblock actions ─────────────────────────────────────
-- Adds columns to platform_actions so we can record when a block was reversed
-- without deleting the original audit record.

ALTER TABLE platform_actions
  ADD COLUMN reversed     BOOLEAN DEFAULT FALSE,
  ADD COLUMN reversed_at  TIMESTAMPTZ,
  ADD COLUMN reversed_by  TEXT;

-- Index for efficiently querying blocked users list
CREATE INDEX idx_platform_actions_blocks
  ON platform_actions(action_type, success)
  WHERE action_type = 'block_sender' AND success = TRUE;
