import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/supabase";

// ── Distributed poll lock ──────────────────────────────────────────────────
// Postgres-backed mutex used by both /api/cron/poll and /api/poll to ensure
// at most one poll runs at a time across all Vercel regions and instances.
//
// Acquire goes through the acquire_poll_lock() Postgres function (see
// supabase/migrations/002_poll_locks.sql), which does a conditional upsert
// in a single atomic statement: INSERT if no row exists, UPDATE if the
// existing row is expired, and otherwise no-op while returning the
// current holder for diagnostics.
//
// Release is a DELETE filtered by both lock_name AND acquired_by, so a
// caller can only release a lock it actually owns. This prevents the
// stale-takeover footgun where process A claims an expired lock from
// process B, and B then wakes up and tries to release "its" lock —
// which is now A's.
//
// TTL is set longer than the cron interval (5 min) so a slow run doesn't
// release the lock mid-execution. If a poll truly hangs, the lock self-
// clears after the TTL and the next cron tick can take over.

export const POLL_LOCK_NAME = "global_poll";
export const POLL_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface LockHandle {
  lockName: string;
  ownerId: string;
}

export interface AcquireResult {
  acquired: boolean;
  handle?: LockHandle;
  heldBy?: string;
  expiresAt?: string;
}

interface AcquireRow {
  acquired: boolean;
  acquired_by: string | null;
  expires_at: string | null;
}

/**
 * Try to acquire the named lock. Returns a handle on success, or details
 * about the current holder on failure. Never throws on contention.
 */
export async function acquireLock(
  lockName: string = POLL_LOCK_NAME,
  ttlMs: number = POLL_LOCK_TTL_MS
): Promise<AcquireResult> {
  const ownerId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);

  const { data, error } = await db.rpc("acquire_poll_lock", {
    p_lock_name: lockName,
    p_owner_id: ownerId,
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("[lock] acquireLock RPC failed:", error.message);
    // Treat unexpected errors as "lock unavailable" so callers degrade gracefully
    // (e.g., cron tick gets skipped) instead of running a poll without a lock.
    return { acquired: false };
  }

  // RPC returning TABLE(...) yields an array of one row.
  const row = (Array.isArray(data) ? data[0] : data) as AcquireRow | null;
  if (!row) {
    return { acquired: false };
  }

  if (row.acquired) {
    return { acquired: true, handle: { lockName, ownerId } };
  }

  return {
    acquired: false,
    heldBy: row.acquired_by ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

/**
 * Release a lock. Only succeeds if the caller owns it (matches acquired_by).
 * Returns true if a row was deleted, false otherwise.
 */
export async function releaseLock(handle: LockHandle): Promise<boolean> {
  const { error, count } = await db
    .from("poll_locks")
    .delete({ count: "exact" })
    .eq("lock_name", handle.lockName)
    .eq("acquired_by", handle.ownerId);

  if (error) {
    console.error("[lock] releaseLock failed:", error.message);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Run a function while holding the lock, releasing in a finally block so a
 * thrown error doesn't strand the lock until TTL. If the lock can't be
 * acquired, returns { acquired: false } without running the function.
 */
export async function withLock<T>(
  fn: () => Promise<T>,
  options: { lockName?: string; ttlMs?: number } = {}
): Promise<
  | { acquired: true; result: T }
  | { acquired: false; heldBy?: string; expiresAt?: string }
> {
  const acquired = await acquireLock(options.lockName, options.ttlMs);
  if (!acquired.acquired || !acquired.handle) {
    return {
      acquired: false,
      heldBy: acquired.heldBy,
      expiresAt: acquired.expiresAt,
    };
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releaseLock(acquired.handle);
  }
}
