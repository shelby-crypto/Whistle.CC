"use client";

/**
 * Reusable toggle switch — used in the auto-protection rule cards on
 * /protection (and elsewhere when we need an on/off binary control).
 *
 * Sizing is responsive by design tokens:
 *   - Desktop: 32×18 px (compact, sits inside small rule cards)
 *   - Mobile:  40×22 px (touch-friendly tap target ~44×44 with padding)
 *
 * Color tokens come from tokens.css:
 *   - Off → `--neutral` (#3A4350)
 *   - On  → `--champagne` (#2DD4BF)
 *
 * The `locked` prop renders a slightly desaturated, cursor-not-allowed
 * variant for the Critical tier's "Save evidence" toggle. Evidence
 * preservation is mandatory for Critical content (ToS / law-enforcement
 * pipeline) so the user can't disable it; the visual hint plus a `title`
 * tooltip makes that clear without needing an extra modal.
 */
export interface ToggleProps {
  /** Current state. */
  checked: boolean;
  /** Fired when the user toggles. Not called when `locked` is true. */
  onChange?: (next: boolean) => void;
  /** When true, toggle stays on/off and refuses input. Used for Critical
   * tier's `saveEvidence` toggle. */
  locked?: boolean;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
}

export default function Toggle({
  checked,
  onChange,
  locked = false,
  ariaLabel,
}: ToggleProps) {
  const handleClick = () => {
    if (locked) return;
    onChange?.(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={locked}
      onClick={handleClick}
      title={
        locked
          ? "Evidence preservation is required for Critical content and cannot be turned off."
          : undefined
      }
      className={`relative shrink-0 rounded-full transition-colors duration-200
        w-8 h-[18px] md:w-8 md:h-[18px]
        max-md:w-10 max-md:h-[22px]
        ${checked ? "bg-champagne" : "bg-neutral"}
        ${locked ? "cursor-not-allowed opacity-90" : "cursor-pointer"}`}
      style={{
        // Slightly muted opacity on the lock state (the 0.9 above) plus a
        // 1px ring tells the user it's not interactive without losing the
        // on-state color the user expects to see.
        boxShadow: locked
          ? "inset 0 0 0 1px rgba(255,255,255,0.08)"
          : undefined,
      }}
    >
      {/* The sliding circle. Sizes are scaled to match each track size:
          14×14 inside the 32×18 desktop track, 18×18 inside the 40×22 mobile
          track. Translation distance equals trackWidth − circleSize − 2*pad. */}
      <span
        aria-hidden
        className={`absolute top-[2px] left-[2px] block rounded-full bg-white transition-transform duration-200
          w-[14px] h-[14px] max-md:w-[18px] max-md:h-[18px]
          ${
            checked
              ? "translate-x-[14px] max-md:translate-x-[18px]"
              : "translate-x-0"
          }`}
      />
    </button>
  );
}
