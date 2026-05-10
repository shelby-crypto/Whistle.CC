"use client";

import { useState } from "react";

/**
 * Inline section-level error block. Used everywhere a query fails — the
 * page keeps its layout and the user gets a "Try again" button right
 * where the failed section would have rendered.
 *
 * Three guidelines, mirrored from the spec:
 *   1. Be specific. The `what` prop forces callers to say what failed
 *      ("Couldn't load activity feed") rather than a generic
 *      "Something went wrong". The component appends a colon and the
 *      error message so users see the actual cause.
 *   2. Don't crash the page. The wrapper is a regular div — placing it
 *      anywhere in the tree replaces just that section.
 *   3. Manual retry only. No exponential backoff, no auto-retry. The
 *      caller passes a sync or async retry handler; the component shows
 *      a spinner while it's in flight and surfaces the next error if
 *      retry itself fails.
 *
 * Optional `level` controls the visual weight: "section" (default) renders
 * inline, "card" wraps the message in a tinted card so it stands out
 * inside an otherwise-empty section.
 */

interface Props {
  /** Short subject describing what failed, e.g. "Dashboard summary". */
  what: string;
  /** Message returned by the query. May be an Error.message or HTTP detail. */
  error: string;
  /** Triggered by the button. May be sync or async. */
  onRetry: () => void | Promise<void>;
  /** Visual emphasis. Defaults to "section". */
  level?: "section" | "card";
}

export default function SectionError({
  what,
  error,
  onRetry,
  level = "section",
}: Props) {
  const [retrying, setRetrying] = useState(false);

  const handleClick = async () => {
    setRetrying(true);
    try {
      await Promise.resolve(onRetry());
    } finally {
      setRetrying(false);
    }
  };

  // The clay (tier-critical) palette is reused intentionally — failures
  // share the visual language of "high-attention" without shouting like
  // a full-screen toast would.
  const palette = {
    bg: "rgba(184, 60, 42, 0.08)",
    border: "rgba(184, 60, 42, 0.3)",
    accent: "var(--clay)",
  };

  if (level === "card") {
    return (
      <div
        role="alert"
        className="rounded-token-4 border px-token-6 py-token-7 mb-token-6"
        style={{ background: palette.bg, borderColor: palette.border }}
      >
        <p
          className="text-body font-semibold mb-1"
          style={{ color: palette.accent }}
        >
          {what} unavailable
        </p>
        <p className="text-meta text-stone-3 mb-token-4">{error}</p>
        <button
          type="button"
          onClick={handleClick}
          disabled={retrying}
          className="rounded-token-3 px-token-6 py-1.5 text-meta font-semibold disabled:opacity-60"
          style={{
            background: "transparent",
            border: `1px solid ${palette.accent}`,
            color: palette.accent,
          }}
        >
          {retrying ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-token-3 mb-token-6 px-token-5 py-token-3 text-meta border flex items-center justify-between gap-token-4"
      style={{
        background: palette.bg,
        borderColor: palette.border,
        color: palette.accent,
      }}
    >
      <span className="leading-snug">
        <strong className="font-semibold">{what}:</strong> {error}
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={retrying}
        className="rounded-token-2 px-token-4 py-1 text-micro font-semibold disabled:opacity-60 shrink-0"
        style={{
          background: "transparent",
          border: `1px solid ${palette.accent}`,
          color: palette.accent,
        }}
      >
        {retrying ? "Trying…" : "Try again"}
      </button>
    </div>
  );
}
