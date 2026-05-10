"use client";

import { useBreakpoint } from "@/components/useBreakpoint";
import type { ActivityRowVariant } from "./types";

/**
 * Activity-feed-specific alias for `useBreakpoint`.
 *
 * The activity feed pre-dates the app-wide breakpoint hook by one prompt;
 * the original implementation lived here. We've since promoted the
 * matchMedia logic to `components/useBreakpoint.ts` so the dashboard,
 * protection, and shell components can share it. This file is now a thin
 * adapter: returns the same `'mobile' | 'desktop'` literal under the
 * `ActivityRowVariant` type alias the row components consume.
 *
 * Keeping the alias means we don't need to ripple a rename across every
 * `useResponsiveVariant()` callsite — the activity row, ActivityFeed,
 * and any future callers stay working without edits.
 */
export function useResponsiveVariant(): ActivityRowVariant {
  return useBreakpoint();
}
