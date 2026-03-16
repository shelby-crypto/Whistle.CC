-- ============================================================================
-- Migration 002: Add Supabase Auth integration + Row-Level Security
--
-- This adds an `auth_id` column to the users table linking to Supabase Auth's
-- auth.users, then enables RLS on all data tables so each user can only see
-- their own data.
-- ============================================================================

-- ── 1. Add auth_id column to users table ────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- ── 2. Helper function: get the app user_id for the current Supabase Auth user
-- This bridges auth.uid() (from the JWT) to our users.id (used as FK everywhere)
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ── 3. Enable RLS on all data tables ────────────────────────────────────────

-- users: can only read/update own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_own ON users FOR SELECT
  USING (auth_id = auth.uid());
CREATE POLICY users_update_own ON users FOR UPDATE
  USING (auth_id = auth.uid());

-- platform_tokens: see only own tokens
ALTER TABLE platform_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tokens_select_own ON platform_tokens FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY tokens_insert_own ON platform_tokens FOR INSERT
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY tokens_update_own ON platform_tokens FOR UPDATE
  USING (user_id = current_app_user_id());
CREATE POLICY tokens_delete_own ON platform_tokens FOR DELETE
  USING (user_id = current_app_user_id());

-- athletes: see only own athletes
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
CREATE POLICY athletes_select_own ON athletes FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY athletes_insert_own ON athletes FOR INSERT
  WITH CHECK (user_id = current_app_user_id());

-- content_items: see only own content
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_select_own ON content_items FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY content_insert_own ON content_items FOR INSERT
  WITH CHECK (user_id = current_app_user_id());

-- pipeline_runs: see only own pipeline runs
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pipeline_select_own ON pipeline_runs FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY pipeline_insert_own ON pipeline_runs FOR INSERT
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY pipeline_update_own ON pipeline_runs FOR UPDATE
  USING (user_id = current_app_user_id());

-- audit_log: see only own audit entries
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select_own ON audit_log FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY audit_insert_own ON audit_log FOR INSERT
  WITH CHECK (user_id = current_app_user_id());

-- platform_actions: see only own actions (joined via pipeline_run)
ALTER TABLE platform_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY actions_select_own ON platform_actions FOR SELECT
  USING (
    pipeline_run_id IN (
      SELECT id FROM pipeline_runs WHERE user_id = current_app_user_id()
    )
  );

-- poll_cursors: see only own cursors
ALTER TABLE poll_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY cursors_select_own ON poll_cursors FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY cursors_upsert_own ON poll_cursors FOR INSERT
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY cursors_update_own ON poll_cursors FOR UPDATE
  USING (user_id = current_app_user_id());

-- poll_status: see only own status
ALTER TABLE poll_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY pollstatus_select_own ON poll_status FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY pollstatus_upsert_own ON poll_status FOR INSERT
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY pollstatus_update_own ON poll_status FOR UPDATE
  USING (user_id = current_app_user_id());

-- ── 4. Service role bypass ──────────────────────────────────────────────────
-- The service role key (used by the poller, action agent, etc.) automatically
-- bypasses RLS. No additional grants needed — Supabase handles this.
-- The anon key + valid JWT enforces RLS policies above.
