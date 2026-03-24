-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Research View — Updated to match actual Whistle database schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this in the Supabase SQL Editor after the first migration.
--
-- Your actual tables:
--   content_items  (not "incidents")  — flagged posts with content, platform, reach, velocity
--   athletes       (correct)          — id, user_id, name, created_at
--   pipeline_runs  (not "pipeline_jobs") — pipeline execution logs
--   platform_tokens (not "platform_status") — platform API credentials
--   poll_status    — platform polling status
--
-- NOTE: Your athletes table doesn't have demographic columns yet (gender,
-- race_ethnicity, sport, etc.). That's expected — the CPO flagged that
-- demographic data requires an explicit consent model before collection.
-- The research view below is built to work WITHOUT demographics for now,
-- and will automatically include them if/when those columns are added later.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Drop the failed view if it partially created ────────────────────────
DROP VIEW IF EXISTS research_incidents_anonymized;


-- ─── Create the anonymized research view using ACTUAL table names ────────
-- This view is what the research role queries. It NEVER exposes:
--   - Real athlete names
--   - Raw post content (abuse text)
--   - Author handles
--   - External post IDs/URLs
--
-- It DOES expose (for research analytics):
--   - Anonymized athlete ID (HMAC done in app layer; MD5 placeholder here)
--   - Platform (twitter, instagram, etc.)
--   - Reach and velocity classifications
--   - Content type
--   - Timestamp
--   - Direction

CREATE OR REPLACE VIEW research_content_anonymized AS
SELECT
    ci.id,
    ci.ingested_at,

    -- Anonymized athlete reference (real HMAC-SHA256 is applied in the app layer)
    MD5(ci.athlete_id::TEXT || 'placeholder_salt') AS athlete_id_anon,

    -- Safe fields for research
    ci.platform,
    ci.reach,
    ci.velocity,
    ci.direction,
    ci.content_type,

    -- Demographics from athletes table — currently only 'name' exists,
    -- which we intentionally EXCLUDE. When demographic columns are added
    -- to the athletes table (gender, race_ethnicity, sport, etc.) with
    -- the consent model, uncomment the lines below:
    --
    -- CASE
    --     WHEN dc.is_active = TRUE AND 'gender' = ANY(dc.consented_fields)
    --     THEN a.gender
    --     ELSE NULL
    -- END AS gender,
    --
    -- CASE
    --     WHEN dc.is_active = TRUE AND 'race_ethnicity' = ANY(dc.consented_fields)
    --     THEN a.race_ethnicity
    --     ELSE NULL
    -- END AS race_ethnicity,

    -- Intentionally EXCLUDED from this view (CPO requirement):
    --   ci.content        (raw abuse text — research should NEVER see this)
    --   ci.author_handle   (identifies the abuser)
    --   ci.external_id     (links back to the original post)
    --   a.name             (real athlete name)
    --   ci.raw_data        (may contain PII in the full API response)

    -- Count field for aggregation
    1 AS incident_count

FROM content_items ci
LEFT JOIN athletes a ON ci.athlete_id = a.id
-- LEFT JOIN demographic_consent dc ON dc.athlete_id = a.id AND dc.is_active = TRUE
-- ^ Uncomment when demographic consent tracking is active
;


-- ─── Grant access to the dashboard reader role ───────────────────────────
-- (This may fail if dashboard_reader role wasn't created yet — that's OK,
--  just run the grant separately after the role exists)
DO $$
BEGIN
    EXECUTE 'GRANT SELECT ON research_content_anonymized TO dashboard_reader';
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'dashboard_reader role does not exist yet — skipping GRANT. Run this grant after creating the role.';
END
$$;


-- ─── Verify: Check that the new dashboard tables exist ───────────────────
-- This query lists all the tables the migration should have created.
-- You should see all 6 in the results.
SELECT table_name,
       CASE WHEN table_name IS NOT NULL THEN '✓ exists' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'dashboard_user_roles',
    'dashboard_sessions',
    'dashboard_audit_log',
    'demographic_consent',
    'export_manifests',
    'data_retention_policies'
  )
ORDER BY table_name;
