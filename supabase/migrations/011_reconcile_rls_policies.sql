-- ============================================================================
-- Migration 011: Reconcile RLS policies between migrations 002 and 010
--
-- BACKGROUND
-- Migration 002 introduced RLS using the helper `current_app_user_id()`,
-- which translates `auth.uid()` (the Supabase Auth UUID) → app `users.id`
-- (the FK target used everywhere in the schema). Those two UUIDs are NOT
-- equal: `users.auth_id` holds the Supabase Auth ID, while `users.id` is
-- a separately-generated app-level UUID.
--
-- Migration 010 then added a parallel set of policies using bare
-- `auth.uid()` against `*.user_id` columns. That made every `*_read_own`
-- policy in 010 return zero rows, because `user_id` is `users.id`, never
-- `auth.uid()`. The most visible case is the `users` table:
--
--     CREATE POLICY "users_read_own"
--       ON users FOR SELECT TO authenticated
--       USING (id = auth.uid());     -- ALWAYS FALSE: users.id != auth.uid()
--
-- Because Postgres OR-combines SELECT policies, reads still work today —
-- they fall through to the migration-002 policies. But any code written
-- against the migration-010 model is silently wrong, and a future cleanup
-- of migration 002 would silently break every authenticated read.
--
-- THIS MIGRATION
-- Drops every policy added in migration 010 (those that reference bare
-- `auth.uid()` against `users.id` or `*.user_id`) and replaces them with
-- policies that use `current_app_user_id()` for app-scoped tables and
-- `auth_id = auth.uid()` for the users table itself.
--
-- Policies from migration 002 are left in place — they are correct and
-- this migration does not duplicate them. Service-role-only tables
-- (platform_tokens, poll_cursors, poll_locks) keep RLS enabled with no
-- policies.
-- ============================================================================

-- ── 1. Drop the broken policies introduced in migration 010 ─────────────────
DROP POLICY IF EXISTS "users_read_own"             ON users;
DROP POLICY IF EXISTS "athletes_read_own"          ON athletes;
DROP POLICY IF EXISTS "content_items_read_own"     ON content_items;
DROP POLICY IF EXISTS "pipeline_runs_read_own"     ON pipeline_runs;
DROP POLICY IF EXISTS "audit_log_read_own"         ON audit_log;
DROP POLICY IF EXISTS "poll_status_read_own"       ON poll_status;
DROP POLICY IF EXISTS "platform_actions_read_own"  ON platform_actions;

-- ── 2. The users table: scope by auth_id, NOT users.id ──────────────────────
-- Migration 002 already defined `users_select_own`/`users_update_own`
-- using `auth_id = auth.uid()`. Re-create them defensively in case 002
-- was rolled back or never run on this environment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'users_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY users_select_own ON users FOR SELECT
             USING (auth_id = auth.uid())';
  END IF;
END $$;

-- ── 3. App-scoped tables: scope by current_app_user_id() ────────────────────
-- All these tables have a `user_id` column that points to `public.users.id`
-- (NOT `auth.users.id`). Use the helper from migration 002.

-- athletes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'athletes'
      AND policyname = 'athletes_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY athletes_select_own ON athletes FOR SELECT
             USING (user_id = current_app_user_id())';
  END IF;
END $$;

-- content_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'content_items'
      AND policyname = 'content_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY content_select_own ON content_items FOR SELECT
             USING (user_id = current_app_user_id())';
  END IF;
END $$;

-- pipeline_runs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pipeline_runs'
      AND policyname = 'pipeline_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY pipeline_select_own ON pipeline_runs FOR SELECT
             USING (user_id = current_app_user_id())';
  END IF;
END $$;

-- audit_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log'
      AND policyname = 'audit_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY audit_select_own ON audit_log FOR SELECT
             USING (user_id = current_app_user_id())';
  END IF;
END $$;

-- poll_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'poll_status'
      AND policyname = 'pollstatus_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY pollstatus_select_own ON poll_status FOR SELECT
             USING (user_id = current_app_user_id())';
  END IF;
END $$;

-- platform_actions: no user_id column; scope via the parent pipeline_run
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_actions'
      AND policyname = 'actions_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY actions_select_own ON platform_actions FOR SELECT
             USING (
               pipeline_run_id IN (
                 SELECT id FROM pipeline_runs
                 WHERE user_id = current_app_user_id()
               )
             )';
  END IF;
END $$;

-- ── 4. Sanity check: confirm no auth.uid() compared against *.user_id ───────
-- This is informational — not enforced by Postgres. Run this query manually
-- in the SQL editor to confirm the cleanup landed:
--
--   SELECT schemaname, tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND qual LIKE '%user_id = auth.uid()%';
--
-- Expected result: zero rows after this migration.
