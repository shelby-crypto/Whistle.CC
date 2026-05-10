"use client";

import { useEffect } from "react";

export type ToastTone = "success" | "error";

interface Props {
  /** Message to display. When null/undefined the toast is hidden. */
  message: string | null;
  /** Auto-dismiss duration in ms. Defaults to 4500. */
  durationMs?: number;
  /** Visual flavor — success (champagne) or error (clay). Defaults to success. */
  tone?: ToastTone;
  /** Called when the toast auto-dismisses or the close button is pressed. */
  onDismiss: () => void;
}

/**
 * Whistle's lightweight toast.
 *
 * Pinned to the bottom-center on mobile (below the BottomNav clearance) and
 * to the bottom-right on ≥md viewports. The toast is announced to assistive
 * tech via `role="status"` + `aria-live="polite"`, so screen readers pick up
 * "Rating saved…" without us hijacking focus.
 *
 * Single-toast contract: the parent owns the `message` state. Replacing the
 * message replaces the toast; setting it to null hides it. Stacking multiple
 * toasts is intentionally out of scope for now — the rating flow surfaces one
 * confirmation at a time, and stacking would compete with the modal's own
 * focus story.
 */
export default function Toast({
  message,
  durationMs = 4500,
  tone = "success",
  onDismiss,
}: Props) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const isSuccess = tone === "success";

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed z-[60] pointer-events-none",
        // Mobile: bottom-center, leaving room for the bottom nav.
        "bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] left-token-4 right-token-4",
        // Desktop: pin to bottom-right with auto width.
        "md:left-auto md:right-token-8 md:bottom-token-8 md:max-w-[420px]",
        "flex justify-center md:justify-end",
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-auto",
          "rounded-token-3 border shadow-lg",
          "px-token-5 py-token-3",
          "flex items-center gap-token-3",
          "text-body font-medium",
          isSuccess
            ? "bg-ink-2 border-champagne text-stone"
            : "bg-ink-2 border-clay text-stone",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "inline-block w-2 h-2 rounded-full shrink-0",
            isSuccess ? "bg-champagne" : "bg-clay",
          ].join(" ")}
          style={
            isSuccess
              ? { boxShadow: "0 0 0 4px rgba(45, 212, 191, 0.18)" }
              : { boxShadow: "0 0 0 4px rgba(184, 60, 42, 0.18)" }
          }
        />
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className={[
            "shrink-0 bg-transparent border-0 cursor-pointer",
            "text-stone-3 hover:text-stone text-meta",
            "leading-none px-token-1",
          ].join(" ")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
