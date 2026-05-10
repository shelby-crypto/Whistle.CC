"use client";

import { useEffect, useState } from "react";

/**
 * App-wide breakpoint label. Two values, on purpose:
 *   - 'mobile'  → < 768px viewport
 *   - 'desktop' → ≥ 768px viewport
 *
 * Per spec, we don't ship a tablet-specific breakpoint. iPads landed at
 * 1024×768 fall on the desktop side and use the desktop layout, which
 * matches the existing test plan.
 */
export type Breakpoint = "mobile" | "desktop";

/**
 * 768px is Tailwind's `md` boundary and also the spec breakpoint. Keep
 * this constant in sync with `tailwind.config.ts` if either ever moves —
 * media-query-driven JS state and CSS-driven layout must agree, otherwise
 * the page renders one variant while the JS thinks it's the other.
 */
export const MOBILE_MAX_WIDTH_PX = 768;

/**
 * Detect viewport size and return the matching breakpoint label.
 *
 * Server-side renders default to `desktop`; the first client effect tick
 * corrects to `mobile` if the viewport is narrow. Defaulting to desktop
 * trades a one-frame mobile flicker for a clean SSR on wide screens
 * (the common case for this product, which is desktop-first).
 *
 * Subscribes to `(max-width: 768px)` via `matchMedia`. Modern browsers
 * use `addEventListener('change', ...)`; Safari < 14 falls back to the
 * legacy `addListener` API.
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("desktop");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const apply = () => setBp(mq.matches ? "mobile" : "desktop");
    apply();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  return bp;
}
