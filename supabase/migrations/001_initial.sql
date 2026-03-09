-- Enable pgcrypto for token encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- App users (one per logged-in user)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE,
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens per platform (encrypted at rest via pgcrypto)
CREATE TABLE platform_tokens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,
  platform                 TEXT NOT NULL CHECK (platform IN ('twitter', 'instagram')),
  platform_user_id         TEXT NOT NULL,
  platform_username        TEXT,
  access_token_encrypted   BYTEA NOT NULL,   -- pgcrypto AES-256 encrypted
  refresh_token_encrypted  BYTEA,            -- pgcrypto AES-256 encrypted (Twitter only)
  token_type               TEXT DEFAULT 'bearer',
  expires_at               TIMESTAMPTZ,
  status                   TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Athletes being monitored (supports future multi-athlete expansion)
CREATE TABLE athletes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Raw ingested social media content
CREATE TABLE content_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  athlete_id    UUID REFERENCES athletes(id),
  platform      TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  content       TEXT NOT NULL,
  author_handle TEXT,
  direction     TEXT,
  reach         TEXT,
  velocity      TEXT,
  raw_data      JSONB,
  ingested_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, external_id)
);

-- Full pipeline execution records
CREATE TABLE pipeline_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id          UUID REFERENCES content_items(id),
  user_id                  UUID REFERENCES users(id),
  classifier_output        JSONB,
  fp_checker_output        JSONB,
  action_agent_output      JSONB,
  stages_completed         TEXT[],
  final_risk_level         TEXT,
  content_action           TEXT,
  account_action           TEXT,
  supplementary_actions    TEXT[],
  safety_override_applied  BOOLEAN DEFAULT FALSE,
  duration_ms              INTEGER,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (append-only — never update or delete rows)
CREATE TABLE audit_log (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id                   UUID REFERENCES pipeline_runs(id),
  content_item_id                   UUID REFERENCES content_items(id),
  user_id                           UUID REFERENCES users(id),
  input_text                        TEXT NOT NULL,
  final_risk_level                  TEXT NOT NULL,
  content_action                    TEXT NOT NULL,
  account_action                    TEXT NOT NULL,
  pipeline_stages_completed         TEXT[],
  irreversible_action_justification TEXT,
  safety_override_applied           BOOLEAN DEFAULT FALSE,
  logged_at                         TIMESTAMPTZ DEFAULT NOW()
);

-- Platform actions taken (for undo trail and audit)
CREATE TABLE platform_actions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id      UUID REFERENCES pipeline_runs(id),
  platform             TEXT NOT NULL,
  action_type          TEXT NOT NULL,
  external_content_id  TEXT,
  external_author_id   TEXT,
  success              BOOLEAN,
  error_message        TEXT,
  executed_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Polling state — tracks last-seen content ID per user per platform
CREATE TABLE poll_cursors (
  user_id       UUID REFERENCES users(id),
  platform      TEXT NOT NULL,
  last_seen_id  TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);

-- Last poll result — single row per user, upserted after each poll
CREATE TABLE poll_status (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  last_poll_at  TIMESTAMPTZ,
  last_result   JSONB,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_pipeline_runs_user    ON pipeline_runs(user_id);
CREATE INDEX idx_pipeline_runs_risk    ON pipeline_runs(final_risk_level);
CREATE INDEX idx_pipeline_runs_created ON pipeline_runs(created_at DESC);
CREATE INDEX idx_content_items_user    ON content_items(user_id);
CREATE INDEX idx_audit_log_user        ON audit_log(user_id);
CREATE INDEX idx_platform_tokens_user  ON platform_tokens(user_id);
CREATE INDEX idx_platform_actions_run  ON platform_actions(pipeline_run_id);

-- ── Supabase Realtime ─────────────────────────────────────────────────────────
-- Enable full row data in Realtime change events for the dashboard feed
ALTER TABLE pipeline_runs REPLICA IDENTITY FULL;

-- ── updated_at triggers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_tokens_updated_at
  BEFORE UPDATE ON platform_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER poll_status_updated_at
  BEFORE UPDATE ON poll_status
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
