-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Closes the Supabase advisor "RLS Disabled in Public" warnings by enabling
-- RLS on every table in the public schema. The service role bypasses RLS, so
-- the server-side poller and API routes (which use SUPABASE_SERVICE_ROLE_KEY)
-- continue to work unchanged.
--
-- Policies below scope reads/writes to the row owner (user_id = auth.uid())
-- for tables the authenticated frontend needs to access. Tables that should
-- never be exposed to the browser get RLS enabled with NO policies — that
-- locks them to service-role-only access.
--
-- Frontend impact: pages that use the raw anon client (app/page.tsx,
-- app/feed/page.tsx, app/messages/page.tsx) MUST be updated to use
-- getSupabaseBrowser() from lib/supabase/browser.ts so the user's session
-- is attached to requests. Without that, auth.uid() is null and policies
-- return zero rows.

-- ── Enable RLS on every table ────────────────────────────────────────────────
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_cursors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_status         ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_locks          ENABLE ROW LEVEL SECURITY;

-- ── User-readable tables ─────────────────────────────────────────────────────
-- Authenticated users can read their own rows. No insert/update/delete from
-- the client — those happen server-side via the service role key.

CREATE POLICY "users_read_own"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "athletes_read_own"
  ON athletes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "content_items_read_own"
  ON content_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "pipeline_runs_read_own"
  ON pipeline_runs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "audit_log_read_own"
  ON audit_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "poll_status_read_own"
  ON poll_status FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- platform_actions has no user_id column; scope via the parent pipeline_run.
CREATE POLICY "platform_actions_read_own"
  ON platform_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pipeline_runs pr
      WHERE pr.id = platform_actions.pipeline_run_id
        AND pr.user_id = auth.uid()
    )
  );

-- ── Service-role-only tables ─────────────────────────────────────────────────
-- RLS enabled with no policies = no access via anon or authenticated keys.
-- Only the service_role key (server-side) can read/write these.
--
--   platform_tokens — encrypted OAuth tokens; never expose to browser.
--   poll_cursors    — internal polling state.
--   poll_locks      — internal distributed lock state.
--
-- These tables intentionally have no CREATE POLICY statements.

-- ── pipeline_runs_feed view ──────────────────────────────────────────────────
-- The dashboard and feed read from a view called pipeline_runs_feed that
-- isn't in any migration file (it was created out-of-band in the SQL editor).
--
-- Postgres 15+ supports the `security_invoker` option on views, which makes
-- the view honor the *caller's* RLS policies on the underlying table rather
-- than the view owner's permissions. Without this, the view runs with the
-- creator's privileges and bypasses RLS — defeating the point of enabling it.
--
-- This block sets security_invoker if the view exists. If the view doesn't
-- exist (e.g., this is a fresh project), the DO block is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'pipeline_runs_feed'
  ) THEN
    EXECUTE 'ALTER VIEW public.pipeline_runs_feed SET (security_invoker = true)';
  END IF;
END $$;
