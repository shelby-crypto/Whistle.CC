-- Migration 008: Calibration submission
--
-- Backs the Calibrate-tier "Help Whistle learn" rating modal.
--
-- Adds:
--   1. pipeline_runs.athlete_rating_comment   — optional free-text comment
--      written by the athlete alongside their rating (kept on the same row
--      so it's automatically RLS-scoped via the existing policies).
--   2. user_settings.calibrations_completed   — append-only counter used by
--      analytics + onboarding completion. Starts at 0; incremented exactly
--      once per successful submit_calibration call.
--   3. submit_calibration() RPC               — single round-trip from the
--      modal that (a) writes the rating + comment onto the activity row and
--      (b) bumps the counter atomically. Returns the new counter so the
--      client can update onboarding state without a follow-up query.
--
-- Naming note: the product surface (Activity feed view, RPC parameter, modal
-- copy) speaks "activity_items" and "item_id". The schema-level row lives on
-- pipeline_runs because activity_items is a security-invoker view over it.
-- The RPC accepts the activity_items.id (== pipeline_runs.id), validates the
-- caller owns the row, and writes through to the underlying table.

-- ============================================================================
-- 1. pipeline_runs: optional athlete comment
-- ============================================================================
-- The rating column already exists (added in migration 006). The comment is
-- nullable on purpose — submit must NOT require it.

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS athlete_rating_comment TEXT;

-- ============================================================================
-- 2. user_settings: calibrations_completed counter
-- ============================================================================
-- Used for analytics ("how many calibrations has the athlete done?") and to
-- drive an onboarding completion gate elsewhere in the product. Defaulting
-- to 0 means existing rows pick up the new column without a backfill.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS calibrations_completed INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- 3. submit_calibration() RPC
-- ============================================================================
-- Contract:
--   - Caller must be authenticated. We re-derive the user via
--     current_app_user_id() rather than trusting any client-supplied id.
--   - p_rating must be one of 'remove' | 'keep' | 'unsure'. Any other value
--     raises an error so the client can surface a useful message.
--   - The activity row must belong to the calling athlete; otherwise the
--     UPDATE matches zero rows and we raise a not-found error so the client
--     can distinguish "doesn't exist" from "someone else's row".
--   - The user_settings row is upserted on the way through so brand-new
--     athletes (no settings row yet) still get their counter incremented.
--
-- The whole body runs inside one implicit transaction (PL/pgSQL function),
-- which gives us "the rating and the counter both land or neither does"
-- without any explicit BEGIN/COMMIT.

CREATE OR REPLACE FUNCTION submit_calibration(
  p_item_id UUID,
  p_rating  TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid              UUID := current_app_user_id();
  v_row_user_id    UUID;
  v_new_counter    INTEGER;
  -- Trim and null-out empty comments so analytics doesn't see ""s.
  v_normalized_cmt TEXT := NULLIF(BTRIM(COALESCE(p_comment, '')), '');
BEGIN
  -- Auth check first — never trust the client-supplied id.
  IF uid IS NULL THEN
    RAISE EXCEPTION 'submit_calibration: unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  -- Whitelist the rating value. The modal already constrains this; the DB
  -- check is defense-in-depth + protection against future callers (mobile
  -- clients, scripts, ...).
  IF p_rating NOT IN ('remove', 'keep', 'unsure') THEN
    RAISE EXCEPTION 'submit_calibration: invalid rating %', p_rating
      USING ERRCODE = '22023';
  END IF;

  -- Confirm the row exists and belongs to the caller. SELECT-then-UPDATE
  -- gives us a clear not-found vs not-yours distinction in the error
  -- message; both surface to the client as "couldn't save" with the same
  -- generic toast, but the server log keeps the truth.
  SELECT user_id
    INTO v_row_user_id
    FROM pipeline_runs
   WHERE id = p_item_id;

  IF v_row_user_id IS NULL THEN
    RAISE EXCEPTION 'submit_calibration: item not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_row_user_id <> uid THEN
    -- Treat cross-user attempts as not-found to avoid leaking row existence.
    RAISE EXCEPTION 'submit_calibration: item not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Write the rating + comment. We always overwrite — Phase 2 will allow
  -- explicit edit; for now an athlete who somehow re-submits gets last-
  -- write-wins, which is the least-surprising behavior.
  UPDATE pipeline_runs
     SET athlete_rating         = p_rating,
         athlete_rating_comment = v_normalized_cmt
   WHERE id = p_item_id;

  -- Bump the counter. UPSERT so we don't require a separate "did the row
  -- exist?" check; the user_settings table is keyed by user_id and any new
  -- row picks up the schema defaults for every other column.
  INSERT INTO user_settings (user_id, calibrations_completed)
       VALUES (uid, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
        calibrations_completed = user_settings.calibrations_completed + 1
    RETURNING calibrations_completed INTO v_new_counter;

  RETURN jsonb_build_object(
    'ok', true,
    'itemId', p_item_id,
    'rating', p_rating,
    'calibrationsCompleted', v_new_counter
  );
END;
$$;

-- Authenticated callers (the modal) need EXECUTE; SECURITY DEFINER means
-- the function runs as its owner, but EXECUTE is still gated on this grant.
GRANT EXECUTE ON FUNCTION submit_calibration(UUID, TEXT, TEXT) TO authenticated;
