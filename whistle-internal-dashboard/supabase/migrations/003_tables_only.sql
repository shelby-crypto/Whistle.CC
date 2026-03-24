-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD TABLES ONLY — No views, no roles, no production table references
-- ═══════════════════════════════════════════════════════════════════════════
-- This creates ONLY the 6 dashboard-specific tables.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. DASHBOARD USER ROLES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_user_roles (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('ops', 'client_success', 'leadership', 'research')),
    allowed_client_ids UUID[] DEFAULT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by      TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    max_sessions    INTEGER DEFAULT 2 NOT NULL,
    data_use_agreed_at  TIMESTAMPTZ DEFAULT NULL,
    data_use_version    TEXT DEFAULT NULL
);


-- ─── 2. DASHBOARD SESSIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_sessions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES dashboard_user_roles(id) ON DELETE CASCADE,
    session_token   TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    last_activity   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    idle_timeout_at TIMESTAMPTZ NOT NULL,
    user_agent      TEXT,
    ip_address      INET,
    revoked         BOOLEAN DEFAULT FALSE NOT NULL,
    revoked_by      TEXT DEFAULT NULL,
    revoked_at      TIMESTAMPTZ DEFAULT NULL
);


-- ─── 3. DASHBOARD AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id         UUID REFERENCES dashboard_user_roles(id),
    user_email      TEXT NOT NULL,
    user_role       TEXT NOT NULL,
    action          TEXT NOT NULL,
    resource_type   TEXT,
    resource_id     TEXT,
    view_purpose    TEXT,
    export_query_params JSONB,
    export_record_count INTEGER,
    export_file_hash    TEXT,
    ip_address      INET,
    user_agent      TEXT,
    metadata        JSONB DEFAULT '{}'
);

-- Append-only protection: prevent UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is append-only. UPDATE and DELETE are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON dashboard_audit_log;
CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON dashboard_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS audit_log_no_delete ON dashboard_audit_log;
CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON dashboard_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();


-- ─── 4. DEMOGRAPHIC CONSENT ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demographic_consent (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    athlete_id          UUID NOT NULL,
    consented_fields    TEXT[] NOT NULL,
    consent_given_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    consent_version     TEXT NOT NULL,
    consent_language    TEXT NOT NULL,
    consent_method      TEXT NOT NULL CHECK (consent_method IN (
        'athlete_direct', 'representative', 'client_onboarding'
    )),
    consented_by_name   TEXT NOT NULL,
    consented_by_email  TEXT,
    withdrawn_at        TIMESTAMPTZ DEFAULT NULL,
    withdrawn_by        TEXT DEFAULT NULL,
    withdrawal_reason   TEXT DEFAULT NULL,
    is_active           BOOLEAN DEFAULT TRUE NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ─── 5. EXPORT MANIFESTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_manifests (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requested_by    UUID NOT NULL REFERENCES dashboard_user_roles(id),
    requested_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    export_type     TEXT NOT NULL CHECK (export_type IN ('csv', 'pdf', 'png')),
    data_category   TEXT NOT NULL,
    query_params    JSONB NOT NULL,
    record_count    INTEGER NOT NULL,
    requires_approval   BOOLEAN DEFAULT FALSE NOT NULL,
    approved_by         UUID REFERENCES dashboard_user_roles(id),
    approved_at         TIMESTAMPTZ,
    approval_status     TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'denied')),
    denial_reason       TEXT,
    file_hash       TEXT NOT NULL,
    file_size_bytes BIGINT,
    watermark_user_id   UUID NOT NULL REFERENCES dashboard_user_roles(id),
    watermark_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days') NOT NULL,
    deleted_at      TIMESTAMPTZ DEFAULT NULL
);


-- ─── 6. DATA RETENTION POLICIES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data_type       TEXT NOT NULL UNIQUE,
    retention_days  INTEGER NOT NULL,
    description     TEXT NOT NULL,
    last_cleanup_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO data_retention_policies (data_type, retention_days, description) VALUES
    ('raw_incidents',         730,  'Raw incident data with PII — 2 years'),
    ('anonymized_aggregates', 1825, 'Anonymized research aggregates — 5 years'),
    ('audit_logs',            1095, 'Dashboard audit logs — 3 years'),
    ('user_sessions',         90,   'Dashboard user session records — 90 days'),
    ('export_files',          30,   'Exported files on server — 30 days')
ON CONFLICT (data_type) DO NOTHING;


-- ─── DONE ────────────────────────────────────────────────────────────────
-- Verify all 6 tables were created:
SELECT table_name, '✓ created' AS status
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
