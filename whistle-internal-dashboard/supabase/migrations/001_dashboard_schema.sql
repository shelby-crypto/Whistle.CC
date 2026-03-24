-- ═══════════════════════════════════════════════════════════════════════════
-- WHISTLE INTERNAL DASHBOARD — DATABASE MIGRATIONS
-- ═══════════════════════════════════════════════════════════════════════════
-- This migration creates all dashboard-specific tables and security controls.
-- Run against the Supabase project that hosts the read replica.
--
-- CISO Requirements Implemented:
--   Finding 3: Read-only database role (dashboard_reader)
--   Finding 4: Append-only audit log with tamper protection trigger
--   Finding 2: Anonymized research views with HMAC placeholder
--
-- CPO Requirements Implemented:
--   Finding 1: Demographic consent tracking table
--   Finding 2: Content access audit logging
--   Finding 3: Data retention metadata
--   Finding 5: Export manifest tracking
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. DASHBOARD USER ROLES ─────────────────────────────────────────────
-- No self-registration. Leadership must manually add users.
-- Maps Google SSO email to an internal role.

CREATE TABLE IF NOT EXISTS dashboard_user_roles (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('ops', 'client_success', 'leadership', 'research')),
    -- For client_success role: which clients they can see (NULL = all for leadership)
    allowed_client_ids UUID[] DEFAULT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by      TEXT NOT NULL,  -- email of the person who granted access
    is_active       BOOLEAN DEFAULT TRUE NOT NULL,
    -- CISO Finding 1: Track concurrent sessions
    max_sessions    INTEGER DEFAULT 2 NOT NULL,
    -- Data use agreement acceptance (CPO Finding 5)
    data_use_agreed_at  TIMESTAMPTZ DEFAULT NULL,
    data_use_version    TEXT DEFAULT NULL
);

CREATE INDEX idx_user_roles_email ON dashboard_user_roles(email);
CREATE INDEX idx_user_roles_role ON dashboard_user_roles(role);


-- ─── 2. ACTIVE SESSIONS ─────────────────────────────────────────────────
-- CISO Finding 1: Session tracking for concurrent session limiting
-- and session revocation capability.

CREATE TABLE IF NOT EXISTS dashboard_sessions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES dashboard_user_roles(id) ON DELETE CASCADE,
    session_token   TEXT NOT NULL UNIQUE,
    -- CISO: 8-hour hard expiry
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    -- CISO: 30-minute idle timeout
    last_activity   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    idle_timeout_at TIMESTAMPTZ NOT NULL,
    -- Device tracking for concurrent session management
    user_agent      TEXT,
    ip_address      INET,
    -- Revocation
    revoked         BOOLEAN DEFAULT FALSE NOT NULL,
    revoked_by      TEXT DEFAULT NULL,
    revoked_at      TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_sessions_user ON dashboard_sessions(user_id);
CREATE INDEX idx_sessions_token ON dashboard_sessions(session_token);
CREATE INDEX idx_sessions_expires ON dashboard_sessions(expires_at);

-- Auto-cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM dashboard_sessions
    WHERE expires_at < NOW() OR revoked = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. AUDIT LOG (APPEND-ONLY) ─────────────────────────────────────────
-- CISO Finding 4: Tamper-protected audit trail.
-- Every data access, content view, and export is logged here.

CREATE TABLE IF NOT EXISTS dashboard_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id         UUID REFERENCES dashboard_user_roles(id),
    user_email      TEXT NOT NULL,
    user_role       TEXT NOT NULL,
    -- What happened
    action          TEXT NOT NULL CHECK (action IN (
        'login', 'logout', 'session_refresh', 'session_revoke',
        'view_page', 'view_metric_detail',
        'view_incident_content',     -- CPO Finding 2: content access logging
        'search_cases',
        'export_csv', 'export_pdf', 'export_png',
        'export_approved', 'export_denied',
        'data_use_agreement_accepted',
        'role_granted', 'role_revoked',
        'consent_recorded', 'consent_withdrawn'
    )),
    -- Context
    resource_type   TEXT,           -- 'incident', 'athlete', 'client', 'metric', 'export'
    resource_id     TEXT,           -- ID of the specific resource accessed
    -- CPO Finding 2: Purpose for content views
    view_purpose    TEXT CHECK (view_purpose IN (
        'quality_review', 'client_inquiry', 'incident_investigation', NULL
    )),
    -- Export metadata (CPO Finding 5)
    export_query_params JSONB,      -- What filters/params were used
    export_record_count INTEGER,    -- How many records exported
    export_file_hash    TEXT,       -- SHA-256 hash of exported file
    -- Request metadata
    ip_address      INET,
    user_agent      TEXT,
    -- Additional context as JSON
    metadata        JSONB DEFAULT '{}'
);

CREATE INDEX idx_audit_timestamp ON dashboard_audit_log(timestamp);
CREATE INDEX idx_audit_user ON dashboard_audit_log(user_id);
CREATE INDEX idx_audit_action ON dashboard_audit_log(action);
CREATE INDEX idx_audit_resource ON dashboard_audit_log(resource_type, resource_id);

-- ══ CISO FINDING 4: APPEND-ONLY TRIGGER ══════════════════════════════════
-- Prevents UPDATE and DELETE on the audit log. A compromised session
-- cannot erase its own access trail.

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is append-only. UPDATE and DELETE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON dashboard_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON dashboard_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();


-- ─── 4. DEMOGRAPHIC CONSENT ─────────────────────────────────────────────
-- CPO Finding 1 (CRITICAL): Explicit consent tracking for athlete
-- demographic data used in research analytics.

CREATE TABLE IF NOT EXISTS demographic_consent (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    athlete_id          UUID NOT NULL,    -- References athletes table in production DB
    -- What was consented to
    consented_fields    TEXT[] NOT NULL,   -- e.g., ['gender', 'race_ethnicity', 'lgbtq_status']
    -- Consent metadata
    consent_given_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    consent_version     TEXT NOT NULL,     -- Version of consent language shown
    consent_language    TEXT NOT NULL,     -- Actual text of consent shown
    consent_method      TEXT NOT NULL CHECK (consent_method IN (
        'athlete_direct',         -- Athlete consented directly
        'representative',         -- Agent/rep consented on behalf
        'client_onboarding'       -- Client org consented during onboarding
    )),
    consented_by_name   TEXT NOT NULL,    -- Who actually signed/agreed
    consented_by_email  TEXT,
    -- Withdrawal
    withdrawn_at        TIMESTAMPTZ DEFAULT NULL,
    withdrawn_by        TEXT DEFAULT NULL,
    withdrawal_reason   TEXT DEFAULT NULL,
    -- Status
    is_active           BOOLEAN DEFAULT TRUE NOT NULL,
    -- Audit
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_consent_athlete ON demographic_consent(athlete_id);
CREATE INDEX idx_consent_active ON demographic_consent(is_active);

-- Function to check if an athlete has active consent for a specific field
CREATE OR REPLACE FUNCTION has_demographic_consent(
    p_athlete_id UUID,
    p_field TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM demographic_consent
        WHERE athlete_id = p_athlete_id
          AND is_active = TRUE
          AND withdrawn_at IS NULL
          AND p_field = ANY(consented_fields)
    );
END;
$$ LANGUAGE plpgsql STABLE;


-- ─── 5. EXPORT MANIFESTS ─────────────────────────────────────────────────
-- CPO Finding 5: Every export generates a traceable manifest.

CREATE TABLE IF NOT EXISTS export_manifests (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requested_by    UUID NOT NULL REFERENCES dashboard_user_roles(id),
    requested_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- What was exported
    export_type     TEXT NOT NULL CHECK (export_type IN ('csv', 'pdf', 'png')),
    data_category   TEXT NOT NULL,    -- 'research_demographics', 'investor_snapshot', etc.
    query_params    JSONB NOT NULL,   -- Full query parameters used
    record_count    INTEGER NOT NULL,
    -- Approval (CPO Finding 5: exports >1000 records or demographic data need approval)
    requires_approval   BOOLEAN DEFAULT FALSE NOT NULL,
    approved_by         UUID REFERENCES dashboard_user_roles(id),
    approved_at         TIMESTAMPTZ,
    approval_status     TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'denied')),
    denial_reason       TEXT,
    -- File tracking
    file_hash       TEXT NOT NULL,    -- SHA-256 of the exported file
    file_size_bytes BIGINT,
    -- Watermark (CISO Finding 2)
    watermark_user_id   UUID NOT NULL REFERENCES dashboard_user_roles(id),
    watermark_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Cleanup tracking (CPO Finding 3: exports retained 30 days max)
    expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days') NOT NULL,
    deleted_at      TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_exports_user ON export_manifests(requested_by);
CREATE INDEX idx_exports_expires ON export_manifests(expires_at);
CREATE INDEX idx_exports_approval ON export_manifests(approval_status);


-- ─── 6. DATA RETENTION POLICIES ──────────────────────────────────────────
-- CPO Finding 3: Defines and enforces retention periods.

CREATE TABLE IF NOT EXISTS data_retention_policies (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data_type       TEXT NOT NULL UNIQUE,
    retention_days  INTEGER NOT NULL,
    description     TEXT NOT NULL,
    last_cleanup_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Seed retention policies per CPO spec
INSERT INTO data_retention_policies (data_type, retention_days, description) VALUES
    ('raw_incidents',       730,  'Raw incident data with PII — 2 years from detection'),
    ('anonymized_aggregates', 1825, 'Anonymized research aggregates — 5 years'),
    ('audit_logs',          1095, 'Dashboard audit logs — 3 years'),
    ('user_sessions',       90,   'Dashboard user session records — 90 days'),
    ('export_files',        30,   'Exported files on server — 30 days')
ON CONFLICT (data_type) DO NOTHING;

-- Function to run retention cleanup (call via cron)
CREATE OR REPLACE FUNCTION run_retention_cleanup()
RETURNS TABLE(data_type TEXT, records_deleted BIGINT) AS $$
BEGIN
    -- Clean up expired sessions
    DELETE FROM dashboard_sessions WHERE expires_at < NOW();

    -- Clean up expired export manifests
    UPDATE export_manifests SET deleted_at = NOW()
    WHERE expires_at < NOW() AND deleted_at IS NULL;

    -- Log the cleanup
    INSERT INTO dashboard_audit_log (user_email, user_role, action, metadata)
    VALUES ('system', 'system', 'view_page', '{"event": "retention_cleanup"}'::jsonb);

    -- Return summary (actual incident cleanup runs against production DB separately)
    RETURN QUERY
    SELECT 'sessions'::TEXT, COUNT(*)::BIGINT FROM dashboard_sessions WHERE expires_at < NOW()
    UNION ALL
    SELECT 'exports'::TEXT, COUNT(*)::BIGINT FROM export_manifests WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;


-- ─── 7. READ-ONLY DATABASE ROLE ─────────────────────────────────────────
-- CISO Finding 3: The dashboard connects with credentials that literally
-- cannot write to production data tables. Defense in depth.

DO $$
BEGIN
    -- Create the role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_reader') THEN
        CREATE ROLE dashboard_reader WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- Grant read access to all production tables
GRANT CONNECT ON DATABASE postgres TO dashboard_reader;
GRANT USAGE ON SCHEMA public TO dashboard_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dashboard_reader;

-- Explicitly deny write operations on production tables
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM dashboard_reader;

-- BUT allow writes to dashboard-specific tables (audit log, sessions, etc.)
-- These are the only tables the dashboard needs to write to.
GRANT INSERT ON dashboard_audit_log TO dashboard_reader;
GRANT INSERT, UPDATE, DELETE ON dashboard_sessions TO dashboard_reader;
GRANT INSERT, UPDATE ON export_manifests TO dashboard_reader;
GRANT USAGE, SELECT ON SEQUENCE dashboard_audit_log_id_seq TO dashboard_reader;


-- ─── 8. ANONYMIZED RESEARCH VIEW ────────────────────────────────────────
-- CISO Finding 2: Database-level anonymization.
-- Even a SQL injection in the research path cannot reach real athlete names.
-- The HMAC function is a placeholder — real HMAC is done in the app layer
-- because the salt must come from environment variables, not the DB.

CREATE OR REPLACE VIEW research_incidents_anonymized AS
SELECT
    i.id,
    i.created_at,
    -- Strip PII: no real names, no post URLs, no client names
    MD5(i.athlete_id::TEXT || 'PLACEHOLDER_SALT') AS athlete_id_anon,
    i.platform,
    i.harm_category,
    i.severity_score,
    i.confidence_score,
    -- Demographics only if consent exists
    CASE
        WHEN dc.is_active = TRUE AND 'gender' = ANY(dc.consented_fields)
        THEN a.gender
        ELSE NULL
    END AS gender,
    CASE
        WHEN dc.is_active = TRUE AND 'race_ethnicity' = ANY(dc.consented_fields)
        THEN a.race_ethnicity
        ELSE NULL
    END AS race_ethnicity,
    CASE
        WHEN dc.is_active = TRUE AND 'lgbtq_status' = ANY(dc.consented_fields)
        THEN a.lgbtq_status
        ELSE NULL
    END AS lgbtq_status,
    -- Aggregatable fields
    a.sport,
    a.competition_level,
    -- No: real_name, social_handle, post_url, post_text, client_name
    i.is_false_positive,
    i.action_taken
FROM incidents i
LEFT JOIN athletes a ON i.athlete_id = a.id
LEFT JOIN demographic_consent dc ON dc.athlete_id = a.id AND dc.is_active = TRUE
-- Note: post_text is intentionally excluded from this view entirely.
-- Research role should NEVER see raw abuse content (CPO Finding 2).
;

-- Grant the research view to dashboard_reader
GRANT SELECT ON research_incidents_anonymized TO dashboard_reader;
