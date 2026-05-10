"use client";

interface Props {
  /**
   * How many items failed to process. The banner is visually identical
   * regardless of count; the wording is "1 item couldn't be processed" /
   * "N items couldn't be processed".
   */
  count: number;
  onRetry?: () => void;
}

/**
 * The purple "couldn't be processed" banner above the activity feed. Render
 * conditionally — this component does not gate itself on `count > 0`, so
 * the parent should `count > 0 && <ErrorBanner ... />`. Doing it that way
 * keeps the parent layout predictable (no surprise 0-height nodes).
 *
 * Colors are inlined as RGBA because the purple isn't part of the token
 * scale — it's a one-off processing-error accent that doesn't appear
 * elsewhere in the system.
 */
export default function ErrorBanner({ count, onRetry }: Props) {
  const message =
    count === 1
      ? "1 item couldn't be processed"
      : `${count} items couldn't be processed`;

  return (
    <div
      role="alert"
      className={[
        "flex justify-between items-center mb-token-10",
        "rounded-token-3 px-token-5 py-token-3 text-meta text-stone-2",
      ].join(" ")}
      style={{
        background: "rgba(168, 85, 247, 0.08)",
        border: "1px solid rgba(168, 85, 247, 0.3)",
      }}
    >
      <div className="flex items-center gap-token-3">
        <span
          aria-hidden
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: "#A855F7" }}
        />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="bg-transparent rounded-token-2 px-token-4 py-1 text-micro font-semibold cursor-pointer"
        style={{
          color: "#A855F7",
          border: "1px solid rgba(168, 85, 247, 0.5)",
        }}
      >
        Retry
      </button>
    </div>
  );
}
