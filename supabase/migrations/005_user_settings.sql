-- Migration 005: User Settings
--
-- Backs the /protection page. Stores athlete-facing protection
-- preferences (social listening config, per-tier auto-protection rules).
-- Monitoring windows are listed in the spec but their list UI is deferred
-- to Phase 2; the schema below leaves room without committing to a shape.
--
-- One row per user_id (1:1 enforced by the PRIMARY KEY). The values are
-- stored as a JSONB blob — the rule shape evolves with the app, so a
-- typed column-per-toggle is more brittle than it's worth right now.
-- The application layer (lib/userSettings.ts) defines the typed schema.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Social Listening: { searchQuery: string, platforms: { twitter, instagram, reddit } }
  social_listening JSONB NOT NULL DEFAULT jsonb_build_object(
    'searchQuery', '',
    'platforms', jsonb_build_object(
      'twitter', true,
      'instagram', false,
      'reddit', false
    )
  ),
  -- Auto-protection rules, keyed by tier id ("critical", "removed", "calibrate").
  -- Each tier holds a flat boolean map of toggle keys → enabled state.
  -- Critical's "saveEvidence" is enforced ON at the application layer
  -- (the toggle is locked) and at the read layer (a server route can
  -- reject any update that flips it off).
  auto_protection  JSONB NOT NULL DEFAULT jsonb_build_object(
    'critical',  jsonb_build_object('block', true,  'remove', true,  'saveEvidence', true),
    'removed',   jsonb_build_object('block', true,  'remove', true,  'mute', false),
    'calibrate', jsonb_build_object('surfaceForRating', true, 'autoMute', false, 'autoRemove', false)
  ),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS: users only see/edit their own settings ──────────────────────────────

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select_own ON user_settings FOR SELECT
  USING (user_id = current_app_user_id());

CREATE POLICY user_settings_insert_own ON user_settings FOR INSERT
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY user_settings_update_own ON user_settings FOR UPDATE
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- Helper trigger: keep updated_at fresh. The /protection page persists on
-- every toggle so a row can churn rapidly; the timestamp doubles as a
-- conflict-detection cue if we add multi-device sync later.
CREATE OR REPLACE FUNCTION user_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION user_settings_touch_updated_at();
