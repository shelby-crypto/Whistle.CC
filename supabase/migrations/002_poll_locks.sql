-- ── Distributed poll lock ─────────────────────────────────────────────────────
-- Replaces the in-process module-level lock previously used in /api/poll.
-- Required because Vercel cron invocations are serverless functions and don't
-- share Node.js memory across ticks — module-level state is not durable.
--
-- A row in this table represents a held lock. Acquiring is done via the
-- acquire_poll_lock() function below, which performs a conditional upsert
-- in a single atomic SQL statement. The TTL guarantees recovery from a
-- process that crashed mid-poll without releasing.

CREATE TABLE IF NOT EXISTS poll_locks (
  lock_name    TEXT PRIMARY KEY,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  acquired_by  TEXT NOT NULL  -- caller-supplied UUID; required to release
);

-- Speeds up the "is the lock expired?" check during contention.
CREATE INDEX IF NOT EXISTS idx_poll_locks_expires_at ON poll_locks(expires_at);

-- ── Atomic acquire ────────────────────────────────────────────────────────────
-- Returns a single row with acquired = true on success, or acquired = false
-- with the current holder's details on contention.
--
-- The body uses a CTE to attempt the conditional upsert; if no row is
-- returned by the upsert (because the lock is held and not expired), it
-- falls through to a SELECT that returns the current holder.
--
-- This is atomic because the upsert and the fallback SELECT share the same
-- snapshot — even if two callers race, exactly one will see RETURNING fire,
-- and the other will deterministically see the winner's row in the SELECT.

CREATE OR REPLACE FUNCTION acquire_poll_lock(
  p_lock_name  TEXT,
  p_owner_id   TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  acquired     BOOLEAN,
  acquired_by  TEXT,
  expires_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_winner TEXT;
  v_expiry TIMESTAMPTZ;
BEGIN
  -- Conditional upsert: insert if absent, update only if existing lock is expired.
  INSERT INTO poll_locks (lock_name, acquired_by, acquired_at, expires_at)
  VALUES (p_lock_name, p_owner_id, NOW(), p_expires_at)
  ON CONFLICT (lock_name) DO UPDATE
    SET acquired_by = EXCLUDED.acquired_by,
        acquired_at = NOW(),
        expires_at  = EXCLUDED.expires_at
    WHERE poll_locks.expires_at < NOW()
  RETURNING poll_locks.acquired_by, poll_locks.expires_at
  INTO v_winner, v_expiry;

  IF v_winner = p_owner_id THEN
    RETURN QUERY SELECT TRUE, v_winner, v_expiry;
    RETURN;
  END IF;

  -- Either the upsert was suppressed (existing lock not expired) or the
  -- RETURNING came back empty. Fetch the current holder for diagnostics.
  SELECT pl.acquired_by, pl.expires_at
  INTO v_winner, v_expiry
  FROM poll_locks pl
  WHERE pl.lock_name = p_lock_name;

  RETURN QUERY SELECT FALSE, v_winner, v_expiry;
END;
$$;
