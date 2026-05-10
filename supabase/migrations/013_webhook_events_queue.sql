-- ============================================================================
-- Migration 013: Webhook event queue + idempotency
--
-- BACKGROUND
-- The Instagram webhook handler previously verified the signature and then
-- ran the full 3-stage Anthropic pipeline + DB writes + platform actions
-- inside the webhook request itself. That had three problems:
--
--   1. NO REPLAY PROTECTION. A captured signed payload could be replayed
--      indefinitely.
--   2. NO ATOMIC IDEMPOTENCY. Concurrent deliveries of the same event from
--      Meta could both pass `contentExists()` and both run the pipeline,
--      producing duplicate moderation actions and Anthropic spend.
--   3. SLOW. Three sequential LLM calls + DB writes + a platform action can
--      easily exceed Meta's ~10s webhook timeout, causing aggressive retry
--      storms that race the still-running first invocation.
--
-- THIS MIGRATION
-- Introduces a `webhook_events` queue table. The webhook handler now does
-- only signature verify + freshness check + insert, then returns 200 in
-- under one second. A new Vercel cron (`/api/cron/process-webhooks`) drains
-- pending rows and runs the pipeline asynchronously.
--
-- The `(platform, event_id) UNIQUE` constraint provides idempotency: a
-- duplicate delivery from Meta hits the constraint and we skip silently.
-- Single-use claim semantics for concurrent workers are provided by the
-- `claim_pending_webhook_events()` SECURITY DEFINER function below, which
-- atomically marks rows `processing` via UPDATE...RETURNING with FOR UPDATE
-- SKIP LOCKED — so two cron ticks racing each other never process the same
-- row twice.
--
-- Replay protection lives in the webhook handler (rejects events whose
-- `entry.time` is older than 5 minutes), not in the schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id            BIGSERIAL    PRIMARY KEY,
  platform      TEXT         NOT NULL,
  -- The dedup key. Webhook handler builds this as e.g. "comment_<igId>"
  -- or "dm_<messageId>" so it's stable across Meta's retry attempts.
  event_id      TEXT         NOT NULL,
  -- The Whistle user this event belongs to (resolved from the IG account
  -- in the webhook payload). NULL is allowed transiently if user lookup
  -- fails; the cron worker will skip and mark such rows as failed.
  user_id       UUID         REFERENCES users(id) ON DELETE CASCADE,
  -- Full event payload — comment text, DM payload, etc. The cron worker
  -- pulls everything it needs from this JSONB.
  payload       JSONB        NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  attempts      INT          NOT NULL DEFAULT 0,
  max_attempts  INT          NOT NULL DEFAULT 5,
  last_error    TEXT,
  received_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,

  UNIQUE (platform, event_id)
);

-- The drain query reads pending rows ordered by received_at; index that.
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_received_at
  ON webhook_events (status, received_at)
  WHERE status IN ('pending', 'processing');

-- ── Atomic claim function ───────────────────────────────────────────────────
-- Returns up to `claim_limit` pending rows, marking each as `processing` and
-- bumping `attempts`. Uses FOR UPDATE SKIP LOCKED so concurrent invocations
-- (two cron ticks racing, manual processing during cron run, etc.) never
-- claim the same row twice.
CREATE OR REPLACE FUNCTION claim_pending_webhook_events(claim_limit INT)
RETURNS TABLE (
  id           BIGINT,
  platform     TEXT,
  event_id     TEXT,
  user_id      UUID,
  payload      JSONB,
  attempts     INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE webhook_events we
  SET status = 'processing',
      attempts = we.attempts + 1
  WHERE we.id IN (
    SELECT inner_we.id
    FROM webhook_events inner_we
    WHERE inner_we.status = 'pending'
      AND inner_we.attempts < inner_we.max_attempts
    ORDER BY inner_we.received_at ASC
    LIMIT claim_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING we.id, we.platform, we.event_id, we.user_id, we.payload, we.attempts;
END;
$$;

-- ── Service-role-only access ────────────────────────────────────────────────
-- Webhook handler + cron worker both run with the service role.
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- (No CREATE POLICY — RLS-on-with-no-policy locks anon/authenticated out.)

-- ── Optional cleanup helper ─────────────────────────────────────────────────
-- Removes rows older than 30 days that are in a terminal state. Run from
-- a periodic cleanup job to keep the queue table small.
CREATE OR REPLACE FUNCTION purge_old_webhook_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_events
   WHERE status IN ('done', 'failed', 'skipped')
     AND received_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
