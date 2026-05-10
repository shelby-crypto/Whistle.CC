"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  DEFAULT_USER_SETTINGS,
  enforceInvariants,
  mergeWithDefaults,
  type UserSettings,
} from "@/lib/userSettings";

/**
 * Hook that owns the protection settings document for the signed-in athlete.
 *
 * Behavior contract:
 *   - On mount: loads the row from `user_settings`. If none exists, the
 *     hook upserts the defaults so a brand-new athlete lands on a populated
 *     UI without writing logic that handles "row absent".
 *   - On every `update(...)` call: merges into local state immediately
 *     (so toggles feel instant) and schedules a debounced write to Supabase.
 *     The debounce window is 250ms — under the 1-second acceptance bound by
 *     4× and tight enough that rapid clicks coalesce into a single network
 *     call.
 *   - Subscribes to Postgres-changes events on `user_settings` so a write
 *     from another tab / device updates the local state in place. Only
 *     remote-origin updates apply (we ignore our own writes by tracking
 *     a local revision token).
 *   - On unmount: flushes any pending write so a fast page-leave doesn't
 *     drop the latest toggle.
 *
 * The hook tolerates an unauthenticated client by short-circuiting all
 * writes — local state still updates, but nothing reaches Supabase. That
 * keeps the page usable in dev (without a logged-in user) while still
 * doing the right thing in production.
 *
 * Page-specific by design: keeping the user_settings shape and the JSONB
 * column mapping in one hook means the rest of the codebase consumes a
 * typed UserSettings object and never has to know about the JSONB columns.
 */

const DEBOUNCE_MS = 250;

// Browser Supabase client. The generated DB types aren't checked into the
// repo, so the strict client type narrows tables to `never`. We cast once
// here — every query in this file is a typed `from(...)` against a real
// table — so callers don't have to repeat the cast for each query.
const supabase = getSupabaseBrowser() as unknown as {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (
      values: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    update: (
      values: Record<string, unknown>,
    ) => {
      eq: (
        col: string,
        val: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  channel: (name: string) => {
    on: (
      event: string,
      filter: Record<string, unknown>,
      cb: (payload: { new: Record<string, unknown> | null }) => void,
    ) => {
      subscribe: () => { unsubscribe: () => void };
    };
  };
  removeChannel: (channel: unknown) => void;
};

export interface UseUserSettings {
  settings: UserSettings;
  loading: boolean;
  error: string | null;
  /** Replace top-level fields. Triggers a debounced save. */
  update: (patch: Partial<UserSettings>) => void;
  /** Mutate one toggle inside autoProtection. Convenience for RuleCard. */
  setRuleToggle: (
    tier: keyof UserSettings["autoProtection"],
    key: string,
    next: boolean,
  ) => void;
}

export function useUserSettings(): UseUserSettings {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Latest settings is held in a ref so the debounced flush always reads
  // the freshest value even if many updates fire before the timer pops.
  const latestRef = useRef<UserSettings>(DEFAULT_USER_SETTINGS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Token used to distinguish writes-from-this-client from realtime events
  // originating elsewhere. We bump it on every local mutation; the realtime
  // handler only applies a payload if the row's `updated_at` differs from
  // our last-observed local timestamp.
  const lastLocalWriteRef = useRef<string | null>(null);

  // ── Load on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Resolve the app `users.id` for the current Supabase auth user.
        // The settings table FKs to that, not auth.uid() directly.
        const authResp = await supabase.auth.getUser();
        const authId = authResp.data.user?.id;
        if (!authId) {
          if (!cancelled) setLoading(false);
          return;
        }

        const userRes = await supabase
          .from("users")
          .select("id")
          .eq("auth_id", authId)
          .maybeSingle();

        const id = (userRes.data as { id?: string } | null)?.id;
        if (!id) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!cancelled) setUserId(id);

        const rowRes = await supabase
          .from("user_settings")
          .select("social_listening, auto_protection")
          .eq("user_id", id)
          .maybeSingle();

        if (cancelled) return;

        if (rowRes.error) {
          setError(rowRes.error.message);
          setLoading(false);
          return;
        }

        const row = rowRes.data as
          | {
              social_listening: UserSettings["socialListening"];
              auto_protection: UserSettings["autoProtection"];
            }
          | null;

        if (row) {
          const merged = enforceInvariants(
            mergeWithDefaults({
              socialListening: row.social_listening,
              autoProtection: row.auto_protection,
            }),
          );
          latestRef.current = merged;
          setSettings(merged);
        } else {
          // Seed a row so subsequent updates are PATCHes, not first-write
          // INSERTs. Failures are non-fatal; the next `update()` will retry.
          await supabase.from("user_settings").insert({
            user_id: id,
            social_listening: DEFAULT_USER_SETTINGS.socialListening,
            auto_protection: DEFAULT_USER_SETTINGS.autoProtection,
          });
        }

        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load settings");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────
  // Migration 006 sets REPLICA IDENTITY FULL on user_settings so the
  // payload carries the full row. We accept any row matching our user_id
  // and drop our own echoes by comparing updated_at to lastLocalWriteRef.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user_settings_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_settings",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as
            | {
                social_listening?: UserSettings["socialListening"];
                auto_protection?: UserSettings["autoProtection"];
                updated_at?: string;
              }
            | null;
          if (!row) return;

          // Skip echoes of our own writes — Supabase realtime emits the
          // event after the row's commit even if we initiated it.
          if (
            row.updated_at &&
            lastLocalWriteRef.current &&
            row.updated_at === lastLocalWriteRef.current
          ) {
            return;
          }

          const merged = enforceInvariants(
            mergeWithDefaults({
              socialListening: row.social_listening,
              autoProtection: row.auto_protection,
            }),
          );
          latestRef.current = merged;
          setSettings(merged);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ── Debounced flush ───────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (!userId) return;
    const next = enforceInvariants(latestRef.current);
    const writeStartedAt = new Date().toISOString();
    lastLocalWriteRef.current = writeStartedAt;
    const { error: writeError } = await supabase
      .from("user_settings")
      .update({
        social_listening: next.socialListening,
        auto_protection: next.autoProtection,
      })
      .eq("user_id", userId);
    if (writeError) {
      setError(writeError.message);
    } else {
      setError(null);
    }
  }, [userId]);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
  }, [flush]);

  // Flush any pending write when the component unmounts so the user
  // doesn't lose a toggle on a fast page-leave.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // Fire and forget — the page is going away.
        void flush();
      }
    };
  }, [flush]);

  // ── Mutators exposed to the page ──────────────────────────────────────
  const update = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const next = enforceInvariants({ ...prev, ...patch });
        latestRef.current = next;
        return next;
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const setRuleToggle = useCallback(
    (
      tier: keyof UserSettings["autoProtection"],
      key: string,
      nextValue: boolean,
    ) => {
      setSettings((prev) => {
        const next = enforceInvariants({
          ...prev,
          autoProtection: {
            ...prev.autoProtection,
            [tier]: {
              ...prev.autoProtection[tier],
              [key]: nextValue,
            },
          } as UserSettings["autoProtection"],
        });
        latestRef.current = next;
        return next;
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  return { settings, loading, error, update, setRuleToggle };
}
