-- Migration 006: Wire /dashboard, /activity, /protection to real data.
--
-- Adds:
--   1. New columns on pipeline_runs (status, athlete_rating, evidence_viewed_at)
--      so the activity feed can express "evidence_pending" critical items and
--      "needs rating" calibrate items without a parallel state store.
--   2. monitoring_windows table — replaces the Phase-1 placeholder UI.
--   3. scan_log              table — append-only per-poll record.
--   4. activity_items        view  — joins content_items + pipeline_runs and
--                                    exposes tier + is_repeat (author repeats
--                                    in trailing 30 days). Inherits RLS from
--                                    the underlying tables via security_invoker.
--   5. list_monitored_accounts() — SECURITY DEFINER reader over platform_tokens
--                                    so the dashboard can list connected
--                                    platforms without granting SELECT on the
--                                    encrypted-token table.
--   6. dashboard_summary()   RPC   — single round-trip aggregate for /dashboard.
--   7. RLS policies on the new tables.
--
-- Naming note: the product surface uses "athlete" wording (e.g., athlete_id);
-- the schema column is `user_id`. They reference the same identity — every
-- /protection user is an athlete — so renaming the column was deferred. The
-- application-level `athlete_id` aliases the schema-level `user_id`.

-- ============================================================================
-- 1. pipeline_runs: workflow status fields
-- ============================================================================
-- These are required by the dashboard's "Waiting on you" block:
--   waiting.critical  = critical rows where evidence still needs review
--   waiting.calibrate = calibrate rows the athlete hasn't rated yet
--
-- Adding them on the existing table (rather than a parallel "review_state"
-- table) keeps the activity_items view a simple join.

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS status              TEXT,
  ADD COLUMN IF NOT EXISTS athlete_rating      TEXT,
  ADD COLUMN IF NOT EXISTS evidence_viewed_at  TIMESTAMPTZ;

-- Backfill: every existing severe-tier row is marked evidence_pending so
-- "Waiting on you" surfaces them on the first post-deploy load. Non-severe
-- rows keep status = NULL until the action agent or product flow assigns
-- one (the dashboard treats NULL as "no longer waiting").
UPDATE pipeline_runs
   SET status = 'evidence_pending'
 WHERE status IS NULL
   AND final_risk_level = 'severe';

-- Composite index for the dashboard tier/date aggregations. The existing
-- single-column indexes already cover most queries, but the chart series
-- groups by (user_id, final_risk_level, day) and benefits from this.
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user_tier_created
  ON pipeline_runs(user_id, final_risk_level, created_at DESC);

-- ============================================================================
-- 2. monitoring_windows
-- ============================================================================
-- Game-day-style heightened monitoring periods. The /protection page lists
-- these (Phase 2) and the dashboard status line surfaces the active one.

CREATE TABLE IF NOT EXISTS monitoring_windows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_monitoring_windows_user_active
  ON monitoring_windows(user_id, start_at, end_at);

ALTER TABLE monitoring_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY monitoring_windows_select_own ON monitoring_windows FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY monitoring_windows_insert_own ON monitoring_windows FOR INSERT
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY monitoring_windows_update_own ON monitoring_windows FOR UPDATE
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY monitoring_windows_delete_own ON monitoring_windows FOR DELETE
  USING (user_id = current_app_user_id());

-- ============================================================================
-- 3. scan_log
-- ============================================================================
-- Append-only record of every poll-cycle completion. Backs the dashboard's
-- "Last scan X min ago" pill and "Whistle has scanned N posts" footer.
--
-- The existing poller writes a single-row latest cursor to poll_status; this
-- table is the historical companion. The poller patch is small (one INSERT
-- per cycle) and lives outside this migration.

CREATE TABLE IF NOT EXISTS scan_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posts_scanned   INTEGER NOT NULL DEFAULT 0,
  source_platform TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_log_user_time
  ON scan_log(user_id, scanned_at DESC);

ALTER TABLE scan_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_log_select_own ON scan_log FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY scan_log_insert_own ON scan_log FOR INSERT
  WITH CHECK (user_id = current_app_user_id());

-- ============================================================================
-- 4. activity_items view
-- ============================================================================
-- Conceptually: "what Whistle caught and classified for this athlete".
-- Composed from content_items (raw post + author) + pipeline_runs
-- (final_risk_level → tier, status, athlete_rating).
--
-- Tier mapping:
--   final_risk_level = 'severe'  → 'critical'
--   final_risk_level = 'high'    → 'removed'
--   final_risk_level = 'medium'  → 'calibrate'
--   anything else                → row dropped (low/none never surface)
--
-- is_repeat:
--   TRUE when the same author_handle has 2+ activity rows for this user
--   in a 30-day rolling window. Computed once in the CTE so the activity
--   feed query stays a single SELECT.
--
-- security_invoker = true makes the view honor the *caller's* RLS on the
-- underlying tables. Without it, the view would run as its owner and bypass
-- RLS — defeating the per-athlete scoping.

DROP VIEW IF EXISTS activity_items;

CREATE VIEW activity_items WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    pr.id                                              AS id,
    pr.user_id                                         AS user_id,
    pr.user_id                                         AS athlete_id,
    CASE pr.final_risk_level
      WHEN 'severe' THEN 'critical'
      WHEN 'high'   THEN 'removed'
      WHEN 'medium' THEN 'calibrate'
    END                                                AS tier,
    ci.author_handle                                   AS author_handle,
    COALESCE(NULLIF(ci.author_handle, ''), 'Unknown')  AS author_display_name,
    ci.platform                                        AS platform,
    pr.created_at                                      AS created_at,
    pr.status                                          AS status,
    pr.athlete_rating                                  AS athlete_rating,
    pr.content_action                                  AS content_action,
    pr.account_action                                  AS account_action,
    ci.content                                         AS content,
    ci.id                                              AS content_item_id
  FROM pipeline_runs pr
  JOIN content_items ci ON ci.id = pr.content_item_id
  WHERE pr.final_risk_level IN ('severe', 'high', 'medium')
)
SELECT
  b.*,
  EXISTS (
    SELECT 1 FROM base b2
     WHERE b2.user_id       = b.user_id
       AND b2.author_handle = b.author_handle
       AND b2.id           <> b.id
       AND b2.created_at >= b.created_at - INTERVAL '30 days'
       AND b2.created_at <= b.created_at + INTERVAL '30 days'
  ) AS is_repeat
FROM base b;

-- Authenticated role needs SELECT on the view (RLS still enforces row-level
-- scoping via the underlying tables).
GRANT SELECT ON activity_items TO authenticated;

-- ============================================================================
-- 5. list_monitored_accounts() — read accounts without exposing tokens
-- ============================================================================
-- platform_tokens has RLS enabled with NO policies (migration 003) — that
-- locks it to service-role-only access. We don't want to weaken that just so
-- the dashboard can show a count, so we expose a SECURITY DEFINER function
-- that scopes by current_app_user_id() and only returns the non-secret
-- columns.

CREATE OR REPLACE FUNCTION list_monitored_accounts()
RETURNS TABLE (
  id                 UUID,
  platform           TEXT,
  platform_username  TEXT,
  status             TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, platform, platform_username, status
    FROM platform_tokens
   WHERE user_id = current_app_user_id()
     AND status  = 'active'
   ORDER BY platform;
$$;

GRANT EXECUTE ON FUNCTION list_monitored_accounts() TO authenticated;

-- ============================================================================
-- 6. dashboard_summary() — one round-trip aggregate
-- ============================================================================
-- Returns one JSONB document covering all six dashboard sections. SECURITY
-- DEFINER + an explicit `current_app_user_id()` scope inside every subquery
-- means we can read platform_tokens (no anon SELECT policy) without granting
-- it to the authenticated role.
--
-- Performance note: every query inside is bounded by `user_id = uid` and
-- supported by an index. The whole function takes a few milliseconds on
-- realistic data; the 1-second dashboard target has plenty of headroom.

CREATE OR REPLACE FUNCTION dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  uid                 UUID := current_app_user_id();
  v_accounts_count    INTEGER := 0;
  v_platforms_label   TEXT;
  v_last_scan_at      TIMESTAMPTZ;
  v_last_scan_minutes INTEGER;
  v_window_row        monitoring_windows%ROWTYPE;
  v_window_json       JSONB := 'null'::JSONB;
  v_waiting_critical  INTEGER := 0;
  v_waiting_calibrate INTEGER := 0;
  v_tier_counts       JSONB;
  v_total_scanned     INTEGER := 0;
  v_chart_series      JSONB;
  v_platforms         JSONB;
BEGIN
  -- Unauthenticated callers get a recognizable empty payload — the page
  -- treats it as "show defaults" rather than throwing.
  IF uid IS NULL THEN
    RETURN jsonb_build_object('unauthenticated', true);
  END IF;

  -- ── Status line: connected accounts + platforms label ────────────────
  SELECT
    COUNT(*)::INTEGER,
    string_agg(DISTINCT initcap(platform), ' and ' ORDER BY initcap(platform))
  INTO v_accounts_count, v_platforms_label
  FROM platform_tokens
  WHERE user_id = uid AND status = 'active';

  -- ── Status line: last scan ───────────────────────────────────────────
  -- Prefer scan_log; fall back to the latest pipeline_run / poll_status.
  SELECT GREATEST(
    COALESCE((SELECT MAX(scanned_at)   FROM scan_log       WHERE user_id = uid), '-infinity'::TIMESTAMPTZ),
    COALESCE((SELECT MAX(created_at)   FROM pipeline_runs  WHERE user_id = uid), '-infinity'::TIMESTAMPTZ),
    COALESCE((SELECT last_poll_at      FROM poll_status    WHERE user_id = uid), '-infinity'::TIMESTAMPTZ)
  )
  INTO v_last_scan_at;

  IF v_last_scan_at IS NULL OR v_last_scan_at = '-infinity'::TIMESTAMPTZ THEN
    v_last_scan_minutes := NULL;
  ELSE
    v_last_scan_minutes := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NOW() - v_last_scan_at)) / 60)
    )::INTEGER;
  END IF;

  -- ── Status line: active monitoring window ────────────────────────────
  SELECT *
    INTO v_window_row
    FROM monitoring_windows
   WHERE user_id = uid
     AND NOW() BETWEEN start_at AND end_at
   ORDER BY start_at DESC
   LIMIT 1;

  IF v_window_row.id IS NOT NULL THEN
    v_window_json := jsonb_build_object(
      'label', v_window_row.label,
      'endsInHours', GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (v_window_row.end_at - NOW())) / 3600)
      )::INTEGER
    );
  END IF;

  -- ── Waiting on you ────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (
      WHERE final_risk_level = 'severe' AND status = 'evidence_pending'
    )::INTEGER,
    COUNT(*) FILTER (
      WHERE final_risk_level = 'medium' AND athlete_rating IS NULL
    )::INTEGER
  INTO v_waiting_critical, v_waiting_calibrate
  FROM pipeline_runs
  WHERE user_id = uid;

  -- ── Recent activity tier counts (last 7 days + all-time) ─────────────
  WITH t AS (
    SELECT
      CASE final_risk_level
        WHEN 'severe' THEN 'critical'
        WHEN 'high'   THEN 'removed'
        WHEN 'medium' THEN 'calibrate'
      END AS tier,
      created_at
    FROM pipeline_runs
    WHERE user_id = uid
      AND final_risk_level IN ('severe', 'high', 'medium')
  )
  SELECT jsonb_object_agg(tier, counts)
    INTO v_tier_counts
    FROM (
      SELECT tier,
             jsonb_build_object(
               'last7Days',
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),
               'allTime',
               COUNT(*)
             ) AS counts
        FROM t
       GROUP BY tier
    ) g;

  -- Ensure every tier key exists even if the user has no rows in it. The
  -- React component reads `counts[tier].last7Days` directly so a missing
  -- key would throw.
  v_tier_counts := COALESCE(v_tier_counts, '{}'::JSONB);
  FOR i IN 0..2 LOOP
    DECLARE
      tier_key TEXT := (ARRAY['critical','removed','calibrate'])[i + 1];
    BEGIN
      IF NOT (v_tier_counts ? tier_key) THEN
        v_tier_counts := v_tier_counts || jsonb_build_object(
          tier_key, jsonb_build_object('last7Days', 0, 'allTime', 0)
        );
      END IF;
    END;
  END LOOP;

  -- ── Posts scanned ─────────────────────────────────────────────────────
  -- Prefer the explicit log; fall back to ingested content count.
  SELECT GREATEST(
    COALESCE((SELECT SUM(posts_scanned) FROM scan_log      WHERE user_id = uid), 0),
    COALESCE((SELECT COUNT(*)           FROM content_items WHERE user_id = uid), 0)
  )::INTEGER
  INTO v_total_scanned;

  -- ── 14-day chart series ───────────────────────────────────────────────
  -- Build an exact 14-row series so the X-axis is dense even when a day
  -- has zero events. generate_series provides the spine; the LEFT JOIN
  -- pulls per-tier counts where they exist.
  WITH days AS (
    SELECT (date_trunc('day', NOW()) - (n || ' days')::INTERVAL)::DATE AS day
      FROM generate_series(13, 0, -1) AS n
  ),
  daily AS (
    SELECT date_trunc('day', created_at)::DATE AS day,
           CASE final_risk_level
             WHEN 'severe' THEN 'critical'
             WHEN 'high'   THEN 'removed'
             WHEN 'medium' THEN 'calibrate'
           END AS tier
    FROM pipeline_runs
    WHERE user_id = uid
      AND created_at >= NOW() - INTERVAL '14 days'
      AND final_risk_level IN ('severe', 'high', 'medium')
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'date',      to_char(d.day, 'YYYY-MM-DD'),
             'critical',  COALESCE(c.critical, 0),
             'removed',   COALESCE(c.removed,  0),
             'calibrate', COALESCE(c.calibrate, 0)
           )
           ORDER BY d.day
         )
    INTO v_chart_series
    FROM days d
    LEFT JOIN (
      SELECT day,
             COUNT(*) FILTER (WHERE tier = 'critical')::INTEGER  AS critical,
             COUNT(*) FILTER (WHERE tier = 'removed')::INTEGER   AS removed,
             COUNT(*) FILTER (WHERE tier = 'calibrate')::INTEGER AS calibrate
        FROM daily
       GROUP BY day
    ) c ON c.day = d.day;

  -- ── Platform breakdown ────────────────────────────────────────────────
  SELECT jsonb_agg(
           jsonb_build_object('name', initcap(platform), 'count', cnt)
           ORDER BY cnt DESC, platform
         )
    INTO v_platforms
    FROM (
      SELECT ci.platform, COUNT(*)::INTEGER AS cnt
        FROM pipeline_runs pr
        JOIN content_items ci ON ci.id = pr.content_item_id
       WHERE pr.user_id = uid
         AND pr.final_risk_level IN ('severe', 'high', 'medium')
       GROUP BY ci.platform
    ) p;

  -- ── Assemble the document ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'status', jsonb_build_object(
      'accountsMonitored',  v_accounts_count,
      'platformsLabel',     COALESCE(v_platforms_label, ''),
      'lastScanMinutesAgo', v_last_scan_minutes,
      'window',             v_window_json
    ),
    'waiting', jsonb_build_object(
      'critical',  v_waiting_critical,
      'calibrate', v_waiting_calibrate
    ),
    'recentActivity', v_tier_counts,
    'scanned',        jsonb_build_object('totalPostsScanned', v_total_scanned),
    'chartSeries',    COALESCE(v_chart_series, '[]'::JSONB),
    'platforms',      COALESCE(v_platforms,    '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_summary() TO authenticated;

-- ============================================================================
-- 7. Realtime: user_settings and monitoring_windows
-- ============================================================================
-- Realtime is opt-in per table — REPLICA IDENTITY FULL ensures the change
-- payload includes the full row so a subscribing client can update local
-- state without a follow-up fetch. The /protection page uses this.

ALTER TABLE user_settings      REPLICA IDENTITY FULL;
ALTER TABLE monitoring_windows REPLICA IDENTITY FULL;
