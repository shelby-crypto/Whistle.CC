"use client";

import { useState } from "react";

interface Props {
  /** Raw post text from `content_items.content`. May be empty. */
  content: string;
}

/**
 * Click-to-reveal viewer for content that Whistle removed.
 *
 * The harmful text never renders unblurred on first paint — the user has to
 * actively click "Show content" to see it. This keeps the page protective by
 * default while still letting the athlete verify what was removed if they
 * want to.
 *
 * Reveal state is per-mount: navigating away and back resets to blurred,
 * matching the protective default. We deliberately don't persist this in
 * URL or storage — every visit starts hidden.
 *
 * Accessibility notes:
 *   - The reveal toggle is a real <button> with aria-pressed, so screen
 *     readers announce the current state.
 *   - When hidden, the content region carries an aria-label describing what
 *     it contains so assistive tech doesn't read empty/blurred text.
 *   - When revealed, the text is in normal flow with no aria-hidden so it
 *     reads naturally.
 */
export default function RemovedContentReveal({ content }: Props) {
  const [revealed, setRevealed] = useState(false);

  // Empty/whitespace-only content is rare but worth handling — we still want
  // to communicate "Whistle removed this" rather than render a blank card.
  const hasContent = content.trim().length > 0;

  return (
    <div className="mt-token-6">
      <div className="text-stone-4 text-micro uppercase tracking-[0.6px] mb-token-3">
        Removed content
      </div>

      {/* Content surface. When hidden, the text is rendered into the DOM but
          obscured with a heavy blur + scrim so it's unreadable. We use real
          text (not a placeholder) so toggling is instant and doesn't shift
          layout. */}
      <div
        className={[
          "relative w-full rounded-token-3 border border-line",
          "bg-ink-3 px-token-6 py-token-5",
          "min-h-[88px]",
          "overflow-hidden",
        ].join(" ")}
        aria-label={
          !revealed && hasContent
            ? "Removed harmful content — hidden until you reveal it"
            : undefined
        }
      >
        {hasContent ? (
          <p
            className={[
              "text-body text-stone leading-relaxed",
              "transition-[filter] duration-150",
              revealed ? "blur-none select-text" : "blur-[10px] select-none",
            ].join(" ")}
            aria-hidden={!revealed}
          >
            {content}
          </p>
        ) : (
          <p className="text-stone-4 text-meta italic">
            Whistle removed this content. The original text isn&rsquo;t
            available to display.
          </p>
        )}

        {/* Reveal scrim — only shown when hidden so the surface reads as
            "blurred and locked behind a click", not "blurred forever". */}
        {!revealed && hasContent && (
          <div
            aria-hidden
            className={[
              "absolute inset-0 flex items-center justify-center",
              "bg-ink-3/40",
            ].join(" ")}
          >
            <span className="text-stone-4 text-micro uppercase tracking-[0.8px]">
              Hidden by default
            </span>
          </div>
        )}
      </div>

      {/* Toggle. Hidden entirely when there's no content to reveal — pressing
          a button that does nothing would be hostile. */}
      {hasContent && (
        <div className="mt-token-3 flex items-center gap-token-3">
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            className={[
              "rounded-token-2 border px-token-4 py-token-2",
              "text-meta font-semibold cursor-pointer",
              "transition-colors",
              revealed
                ? "border-line-2 text-stone-2 hover:bg-ink-2"
                : "border-champagne/40 text-champagne hover:bg-champagne/10",
            ].join(" ")}
          >
            {revealed ? "Hide content" : "Show content"}
          </button>
          <span className="text-stone-4 text-meta">
            {revealed
              ? "You can re-hide this any time."
              : "Whistle keeps removed text hidden by default."}
          </span>
        </div>
      )}
    </div>
  );
}
