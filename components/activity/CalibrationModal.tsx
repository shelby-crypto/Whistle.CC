"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { ActivityItem } from "./types";
import { formatActivityDate } from "./date";

/**
 * The three rating values the modal can submit. Locked vocabulary — keep in
 * sync with the CHECK in submit_calibration() (migration 008).
 */
export type CalibrationRating = "remove" | "keep" | "unsure";

/**
 * Per-rating button copy. Centralised so the labels read consistently in
 * both the button and any future analytics surface.
 */
const RATINGS: ReadonlyArray<{
  value: CalibrationRating;
  label: string;
  variant: "remove" | "keep" | "unsure";
}> = [
  {
    value: "remove",
    label: "Remove this kind of content next time",
    variant: "remove",
  },
  {
    value: "keep",
    label: "Keep showing me — I want to see it",
    variant: "keep",
  },
  { value: "unsure", label: "I'm not sure", variant: "unsure" },
];

/**
 * Session-scoped flag: have we already shown the "this content may be
 * upsetting" confirmation in the current tab? Stored on `window` rather
 * than sessionStorage so it resets when the tab closes (good — every new
 * session re-prompts, never relaxes the protective default permanently).
 */
const REVEAL_CONFIRMED_KEY = "__whistle_reveal_confirmed__";

function hasConfirmedRevealThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as Record<string, unknown>)[REVEAL_CONFIRMED_KEY],
  );
}

function markRevealConfirmedThisSession(): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[REVEAL_CONFIRMED_KEY] = true;
}

/**
 * Result returned to the parent via `onSubmitted` — used to update the
 * onboarding/analytics counter without a follow-up query.
 */
export interface CalibrationSubmitResult {
  itemId: string;
  rating: CalibrationRating;
  calibrationsCompleted?: number;
}

interface Props {
  /** Activity item being rated. `null` hides the modal. */
  item: ActivityItem | null;
  /** Close without submitting. */
  onClose: () => void;
  /**
   * Called *after* the rating is persisted. The parent uses this to remove
   * the item from the Calibrate section optimistically and surface the
   * success toast. The optimistic update happens at the *parent* level so
   * a network failure doesn't mutate the feed before this resolves.
   */
  onSubmitted: (result: CalibrationSubmitResult) => void;
  /**
   * Called when the submission fails. The parent surfaces an error toast
   * and (if it had already optimistically removed the row) restores it.
   */
  onSubmitError?: (message: string) => void;
}

/**
 * Calibrate-tier rating modal — "Help Whistle learn".
 *
 * Protective defaults the modal enforces:
 *   - Harmful content stays blurred until the athlete clicks "Show content".
 *   - First reveal in a session prompts a confirmation ("This content may
 *     be upsetting. Are you sure?"). Subsequent reveals in the same session
 *     skip the prompt; a new tab/session starts the protection over.
 *   - Submit is disabled until the athlete picks a rating; the comment is
 *     never required.
 *
 * Side effects on submit:
 *   - Calls the `submit_calibration` RPC, which writes the rating + comment
 *     onto the activity row and increments user_settings.calibrations_completed.
 *   - The optimistic feed mutation lives in ActivityFeed; this component
 *     just hands the result back via `onSubmitted`.
 */
export default function CalibrationModal({
  item,
  onClose,
  onSubmitted,
  onSubmitError,
}: Props) {
  const [rating, setRating] = useState<CalibrationRating | null>(null);
  const [comment, setComment] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [confirmingReveal, setConfirmingReveal] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset every modal field when the item changes — no rating leakage between
  // two consecutive opens.
  useEffect(() => {
    if (!item) return;
    setRating(null);
    setComment("");
    setRevealed(false);
    setConfirmingReveal(false);
    setContent(null);
    setContentError(null);
    setContentLoading(false);
    setSubmitting(false);
  }, [item]);

  // Escape closes (matches the previous RateModal behavior).
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmingReveal) {
          setConfirmingReveal(false);
        } else if (!submitting) {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose, confirmingReveal, submitting]);

  // Keep a ref to the dialog so we can move focus into it when it opens.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!item) return;
    // Focus the dialog so screen readers + keyboard users land inside.
    dialogRef.current?.focus();
  }, [item]);

  // Date label — same desktop format the detail page uses ("5/9/2026").
  const dateLabel = useMemo(
    () => (item ? formatActivityDate(item.date, "desktop") : ""),
    [item],
  );

  if (!item) return null;

  /**
   * Lazily fetch the actual content text. Keeping this off the initial
   * `useActivityFeed` query means harmful text never lives in the client
   * until the athlete asks for it — the protective default is enforced at
   * the data layer, not just the visual layer.
   */
  const fetchContent = async () => {
    setContentLoading(true);
    setContentError(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from("activity_items")
        .select("content")
        .eq("id", item.id)
        .maybeSingle<{ content: string | null }>();
      if (error) {
        setContentError(error.message);
        return;
      }
      setContent(data?.content ?? "");
    } catch (e) {
      setContentError(e instanceof Error ? e.message : "Couldn't load content");
    } finally {
      setContentLoading(false);
    }
  };

  const onShowContent = () => {
    if (revealed) return;
    if (hasConfirmedRevealThisSession()) {
      setRevealed(true);
      void fetchContent();
      return;
    }
    setConfirmingReveal(true);
  };

  const confirmReveal = () => {
    markRevealConfirmedThisSession();
    setConfirmingReveal(false);
    setRevealed(true);
    void fetchContent();
  };

  const cancelReveal = () => setConfirmingReveal(false);

  const onHideContent = () => {
    setRevealed(false);
    setContent(null);
  };

  const onSubmit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);

    try {
      const supabase = getSupabaseBrowser();
      // The RPC validates the rating server-side, increments the counter,
      // and writes through to pipeline_runs. One round-trip — no follow-up
      // SELECT needed because the parent already has the optimistic state.
      const { data, error } = await (
        supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{
            data: {
              ok?: boolean;
              calibrationsCompleted?: number;
            } | null;
            error: { message: string } | null;
          }>;
        }
      ).rpc("submit_calibration", {
        p_item_id: item.id,
        p_rating: rating,
        p_comment: comment.trim() ? comment.trim() : null,
      });

      if (error) {
        const msg = error.message || "Couldn't save your rating.";
        onSubmitError?.(msg);
        setSubmitting(false);
        return;
      }

      onSubmitted({
        itemId: item.id,
        rating,
        calibrationsCompleted: data?.calibrationsCompleted,
      });
      // Parent will close the modal as part of its post-submit flow; we
      // also clear submitting here in case the parent leaves us mounted.
      setSubmitting(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Couldn't save your rating.";
      onSubmitError?.(msg);
      setSubmitting(false);
    }
  };

  // Prevent backdrop clicks from closing while we're mid-submit — losing the
  // modal state on a slow network would feel like a silent failure.
  const onBackdropClick = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calibration-modal-title"
      aria-describedby="calibration-modal-subtitle"
      className={[
        "fixed inset-0 z-50",
        "flex items-end md:items-center justify-center",
        // No outer padding on mobile so the sheet hugs the bottom edge;
        // desktop centers with breathing room.
        "p-0 md:p-token-6",
      ].join(" ")}
      style={{ background: "rgba(15, 20, 25, 0.7)" }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={[
          "w-full max-w-[520px] bg-ink-2 border border-line text-stone",
          // Phone: bottom-sheet feel with rounded top corners and a max
          // height so the sheet scrolls inside if the screen is short.
          "rounded-t-token-5 md:rounded-token-5",
          "max-h-[92vh] overflow-y-auto",
          "p-token-6 md:p-token-10 shadow-2xl",
          "outline-none",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-token-4 mb-token-3">
          <div className="min-w-0">
            <h2
              id="calibration-modal-title"
              className="font-serif font-normal text-stone"
              style={{ fontSize: "var(--fs-h2)" }}
            >
              Help Whistle learn
            </h2>
            <p
              id="calibration-modal-subtitle"
              className="text-stone-3 text-meta mt-token-1 leading-relaxed"
            >
              How should this kind of content be handled in the future?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className={[
              "bg-transparent border-0 text-stone-3 text-[22px] leading-none",
              "cursor-pointer hover:text-stone shrink-0",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            ×
          </button>
        </div>

        {/* Item preview — avatar + author + handle + platform + date */}
        <div className="flex items-start gap-token-3 mb-token-4 mt-token-5">
          <Avatar
            handle={item.author.handle}
            displayName={item.author.displayName}
            initials={item.author.initials}
            tokenIndex={item.author.avatarSlot}
            size={36}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-stone text-body font-medium truncate">
              {item.author.displayName}
            </div>
            <div className="text-stone-4 text-micro truncate">
              @{item.author.handle.replace(/^@/, "")} ·{" "}
              <span className="lowercase">{item.platform}</span> · {dateLabel}
            </div>
          </div>
        </div>

        {/* Content area — blurred by default, reveals on confirmed click */}
        <div className="mb-token-6">
          {!revealed ? (
            <ContentBlurBar onShow={onShowContent} />
          ) : (
            <RevealedContent
              loading={contentLoading}
              error={contentError}
              text={content}
              onHide={onHideContent}
              onRetry={fetchContent}
            />
          )}
        </div>

        {/* Rating buttons — three vertically stacked options */}
        <fieldset className="mb-token-6 border-0 p-0 m-0">
          <legend className="sr-only">How should this be handled?</legend>
          <div className="flex flex-col gap-token-3">
            {RATINGS.map((r) => (
              <RatingButton
                key={r.value}
                label={r.label}
                variant={r.variant}
                active={rating === r.value}
                disabled={submitting}
                onClick={() => setRating(r.value)}
              />
            ))}
          </div>
        </fieldset>

        {/* Optional comment box */}
        <div className="mb-token-6">
          <label
            htmlFor="calibration-comment"
            className="block text-stone-2 text-meta mb-token-2"
          >
            Tell us why{" "}
            <span className="text-stone-4 font-normal">(optional)</span>
          </label>
          <textarea
            id="calibration-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={submitting}
            rows={3}
            placeholder="What about this should Whistle learn?"
            maxLength={500}
            className={[
              "w-full rounded-token-3 border border-line-2",
              "bg-ink-3 text-stone text-body",
              "px-token-4 py-token-3 resize-y",
              "placeholder:text-stone-4",
              "focus:outline-none focus:border-champagne",
              "disabled:opacity-60",
            ].join(" ")}
          />
        </div>

        {/* Action row */}
        <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-token-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={[
              "text-stone-3 text-meta underline-offset-2 hover:underline",
              "bg-transparent border-0 cursor-pointer",
              "self-center md:self-auto",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!rating || submitting}
            className={[
              "rounded-token-3 px-token-7 py-token-3",
              "text-body font-semibold",
              "bg-champagne text-ink border-0",
              "cursor-pointer hover:opacity-90",
              "focus:outline-none focus:ring-2 focus:ring-champagne/50",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50",
            ].join(" ")}
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </div>

        {/* First-time-per-session reveal confirmation. Layered above the
            modal so the rest of the form stays in place when the athlete
            cancels. */}
        {confirmingReveal && (
          <RevealConfirmation
            onConfirm={confirmReveal}
            onCancel={cancelReveal}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The default protected view: blurred bar + "Show content" affordance.
 * Mirrors the same gradient treatment used on the Activity row and the
 * Evidence Preservation page so the visual language stays consistent.
 */
function ContentBlurBar({ onShow }: { onShow: () => void }) {
  return (
    <div
      className={[
        "relative rounded-token-3 border border-line",
        "bg-ink-3 px-token-5 py-token-5",
      ].join(" ")}
    >
      <div className="text-stone-4 text-micro uppercase tracking-[0.6px] mb-token-3">
        Hidden by default
      </div>
      <div
        role="img"
        aria-label="Content hidden — click Show content to reveal"
        className="w-full h-[44px] rounded-token-2"
        style={{
          background:
            "linear-gradient(90deg, var(--line) 0%, var(--line-2) 30%, var(--line) 60%, var(--line-2) 90%)",
          opacity: 0.7,
        }}
      />
      <div className="mt-token-4 flex items-center justify-between gap-token-3">
        <p className="text-stone-4 text-micro leading-relaxed max-w-[320px]">
          Whistle keeps the text hidden so you don&rsquo;t have to read it
          unless you choose to.
        </p>
        <button
          type="button"
          onClick={onShow}
          className={[
            "shrink-0 text-champagne text-meta font-semibold",
            "bg-transparent border-0 cursor-pointer underline-offset-2",
            "hover:underline focus:outline-none focus:underline",
          ].join(" ")}
        >
          Show content
        </button>
      </div>
    </div>
  );
}

/**
 * The revealed view — full text, plus a "Hide" affordance so the athlete can
 * snap the protective default back on without closing the modal.
 */
function RevealedContent({
  loading,
  error,
  text,
  onHide,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  text: string | null;
  onHide: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className={[
        "rounded-token-3 border border-line",
        "bg-ink-3 px-token-5 py-token-5",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-token-3 mb-token-3">
        <span className="text-stone-4 text-micro uppercase tracking-[0.6px]">
          Content
        </span>
        <button
          type="button"
          onClick={onHide}
          className={[
            "text-stone-3 text-micro font-semibold",
            "bg-transparent border-0 cursor-pointer underline-offset-2",
            "hover:underline focus:outline-none focus:underline",
          ].join(" ")}
        >
          Hide
        </button>
      </div>
      {loading && (
        <p className="text-stone-3 text-meta">Loading content…</p>
      )}
      {!loading && error && (
        <div>
          <p className="text-clay text-meta mb-token-2">
            Couldn&rsquo;t load the content: {error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={[
              "text-champagne text-meta font-semibold",
              "bg-transparent border-0 cursor-pointer underline-offset-2",
              "hover:underline focus:outline-none focus:underline",
            ].join(" ")}
          >
            Try again
          </button>
        </div>
      )}
      {!loading && !error && (
        <p className="text-stone text-body whitespace-pre-wrap break-words leading-relaxed">
          {text || (
            <span className="text-stone-4 italic">
              No content text was preserved for this item.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * First-time-per-session confirmation overlay. Stays inside the modal card
 * so canceling drops the athlete back into the form unchanged. Once
 * confirmed, the session flag suppresses this overlay for subsequent
 * reveals — but only until the tab closes.
 */
function RevealConfirmation({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="reveal-confirm-title"
      className={[
        "absolute inset-0 z-10",
        "flex items-center justify-center",
        "p-token-5",
      ].join(" ")}
      style={{ background: "rgba(15, 20, 25, 0.85)" }}
    >
      <div
        className={[
          "w-full max-w-[400px] bg-ink-2 border border-line",
          "rounded-token-4 p-token-6 shadow-xl",
        ].join(" ")}
      >
        <h3
          id="reveal-confirm-title"
          className="font-serif font-normal text-stone mb-token-2"
          style={{ fontSize: "var(--fs-h3)" }}
        >
          This content may be upsetting. Are you sure?
        </h3>
        <p className="text-stone-3 text-meta leading-relaxed mb-token-5">
          Whistle hides this kind of post by default to protect you. You
          don&rsquo;t need to read it to rate it — but you can if it helps.
        </p>
        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-token-3">
          <button
            type="button"
            onClick={onCancel}
            className={[
              "rounded-token-3 px-token-5 py-token-2",
              "bg-transparent border border-line-2 text-stone text-meta font-semibold",
              "cursor-pointer hover:bg-ink-3",
            ].join(" ")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={[
              "rounded-token-3 px-token-5 py-token-2",
              "bg-champagne text-ink border-0 text-meta font-semibold",
              "cursor-pointer hover:opacity-90",
            ].join(" ")}
          >
            Yes, show it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Single rating-option button. Three visual variants matching the action
 * affordances elsewhere in the app:
 *   - remove → clay (matches Critical / Removed actions)
 *   - keep   → champagne (matches the "all clear" / submit accent)
 *   - unsure → outlined neutral (matches the calibrate Rate-this style)
 *
 * Active state is indicated by a 2px ring in the variant's primary color and
 * a slightly lifted background. The control is a real `<button>` (not a
 * radio) because the surrounding click target reads as an action — a click
 * picks; a second click on a different option swaps the selection.
 */
function RatingButton({
  label,
  variant,
  active,
  disabled,
  onClick,
}: {
  label: string;
  variant: "remove" | "keep" | "unsure";
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const base = [
    "w-full text-left",
    "rounded-token-3 px-token-5 py-token-4",
    "text-body font-medium leading-snug",
    "border cursor-pointer transition-colors",
    "focus:outline-none focus:ring-2",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" ");

  const variants: Record<string, string> = {
    remove: active
      ? "bg-clay/15 text-stone border-clay ring-clay/40 focus:ring-clay/40"
      : "bg-ink-3 text-stone border-line-2 hover:border-clay/60 hover:bg-clay/5 focus:ring-clay/40",
    keep: active
      ? "bg-champagne/15 text-stone border-champagne ring-champagne/40 focus:ring-champagne/40"
      : "bg-ink-3 text-stone border-line-2 hover:border-champagne/60 hover:bg-champagne/5 focus:ring-champagne/40",
    unsure: active
      ? "bg-ink-3 text-stone border-stone-3 ring-stone-3/40 focus:ring-stone-3/40"
      : "bg-ink-3 text-stone-2 border-line-2 hover:border-stone-3 hover:text-stone focus:ring-stone-3/40",
  };

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]}`}
    >
      {label}
    </button>
  );
}
