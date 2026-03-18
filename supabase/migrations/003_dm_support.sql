-- ── DM Support ─────────────────────────────────────────────────────────────
-- Adds content_type to content_items so we can distinguish comments from DMs,
-- and a dm_conversations table to track known conversation partners
-- (so we only scan first-contact / new conversations).

-- Add content_type column to content_items (defaults to 'comment' for backward compat)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'comment'
  CHECK (content_type IN ('comment', 'dm'));

-- Track known DM conversation partners per user
-- Once the account owner replies, the sender_ig_id is marked as "known"
-- and future messages from them are skipped.
CREATE TABLE IF NOT EXISTS dm_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  sender_ig_id    TEXT NOT NULL,           -- Instagram user ID of the sender
  sender_username TEXT,                     -- Instagram username (for display)
  is_new          BOOLEAN DEFAULT TRUE,     -- TRUE = first contact, FALSE = user has replied
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  replied_at      TIMESTAMPTZ,              -- When account owner first replied
  UNIQUE(user_id, sender_ig_id)
);

-- Index for quick lookup during webhook processing
CREATE INDEX IF NOT EXISTS idx_dm_conversations_lookup
  ON dm_conversations(user_id, sender_ig_id);

-- Index for filtering DMs in the feed
CREATE INDEX IF NOT EXISTS idx_content_items_type
  ON content_items(content_type);
