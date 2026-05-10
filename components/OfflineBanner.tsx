"use client";

import { useOnline } from "./useOnline";

/**
 * Page-level "you're offline" notice.
 *
 * Appears as a thin sticky banner at the top of the viewport when the
 * browser reports `navigator.onLine === false`. The UI behind it stays
 * fully interactive — per spec, going offline does NOT block navigation
 * or hide cached data.
 *
 * Render this once near the root of the app (e.g. in `app/layout.tsx`).
 * Multiple instances would stack but it's a noop while online so a
 * misplaced extra render is harmless.
 *
 * The styling uses ochre (calibrate tier color) so it reads as a soft
 * warning rather than a hard error — being offline isn't the user's
 * fault, and forcing a red alarm would feel punishing.
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 left-0 right-0 z-50 px-token-5 py-2 text-center text-meta border-b"
      style={{
        background: "rgba(200, 146, 61, 0.12)",
        borderColor: "rgba(200, 146, 61, 0.3)",
        color: "var(--ochre)",
      }}
    >
      You&apos;re offline. Showing last cached data.
    </div>
  );
}
