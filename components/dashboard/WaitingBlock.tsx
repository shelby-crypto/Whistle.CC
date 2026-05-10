"use client";

import { useRouter } from "next/navigation";
import type { WaitingCounts } from "@/lib/mockDashboardData";

/**
 * Section 2 — "Waiting on you", the personal action queue.
 *
 * Renders one row per actionable tier (critical, calibrate). Each row
 * surfaces a small icon tile, label + helper copy, and a tier-tinted CTA
 * (filled clay for critical, outlined ochre for calibrate). The CTA sits
 * at the right on desktop and stacks full-width below the row on mobile.
 *
 * If both `critical` and `calibrate` counts are zero, the entire block
 * collapses into a single green "All clear. Nothing waiting on you."
 * banner — same chrome as the StatusLine so the empty state feels like
 * an extension of the protected message rather than a separate card.
 */
export default function WaitingBlock({ waiting }: { waiting: WaitingCounts }) {
  const router = useRouter();

  const hasCritical = waiting.critical > 0;
  const hasCalibrate = waiting.calibrate > 0;

  // Empty state — neither tier has anything pending.
  if (!hasCritical && !hasCalibrate) {
    return (
      <div
        className="rounded-token-3 mb-token-11 px-token-5 py-3 flex items-center gap-token-6"
        style={{
          background: "rgba(45, 212, 191, 0.08)",
          border: "1px solid rgba(45, 212, 191, 0.3)",
        }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full bg-champagne flex-shrink-0"
          style={{ boxShadow: "0 0 0 4px rgba(45, 212, 191, 0.15)" }}
          aria-hidden
        />
        <span className="text-body font-medium text-stone">
          All clear. Nothing waiting on you.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-token-5 border border-line bg-ink-2 px-token-10 py-token-9 mb-token-11">
      <h2 className="font-serif text-h2 mb-token-5">Waiting on you</h2>

      {hasCritical && (
        <WaitingRow
          variant="critical"
          icon="!"
          label={pluralize(waiting.critical, "critical item", "critical items")}
          desc="Evidence preserved and ready to share with law enforcement"
          ctaLabel={`Review ${waiting.critical} critical →`}
          isFirst
          onClick={() => router.push("/activity?tier=critical")}
        />
      )}

      {hasCalibrate && (
        <WaitingRow
          variant="calibrate"
          icon="◐"
          label={pluralize(waiting.calibrate, "item to calibrate", "items to calibrate")}
          desc="Rate borderline content so Whistle learns your line"
          ctaLabel={`Rate ${waiting.calibrate} items →`}
          isFirst={!hasCritical}
          onClick={() => router.push("/activity?tier=calibrate")}
        />
      )}
    </div>
  );
}

interface WaitingRowProps {
  variant: "critical" | "calibrate";
  icon: string;
  label: string;
  desc: string;
  ctaLabel: string;
  isFirst: boolean;
  onClick: () => void;
}

function WaitingRow({
  variant,
  icon,
  label,
  desc,
  ctaLabel,
  isFirst,
  onClick,
}: WaitingRowProps) {
  // Tier-driven icon-tile styling — clay tint for critical, ochre for calibrate.
  const iconTintBg =
    variant === "critical"
      ? "rgba(184, 60, 42, 0.2)"
      : "rgba(200, 146, 61, 0.2)";
  const iconTintColor =
    variant === "critical" ? "var(--clay)" : "var(--ochre)";

  return (
    <div
      className={`${
        isFirst ? "pt-1" : "pt-token-5 border-t border-line"
      } pb-token-4 md:pb-token-5 md:grid md:grid-cols-[24px_1fr_auto] md:gap-token-5 md:items-center`}
    >
      {/* Mobile: icon + text in a top row */}
      <div className="flex items-center gap-token-3 mb-token-3 md:mb-0 md:contents">
        <span
          className="inline-flex items-center justify-center w-[22px] h-[22px] md:w-6 md:h-6 rounded-token-2 text-meta font-bold flex-shrink-0"
          style={{ background: iconTintBg, color: iconTintColor }}
          aria-hidden
        >
          {icon}
        </span>
        <div className="md:contents">
          <div>
            <div className="text-body font-semibold text-stone">{label}</div>
            <div className="text-micro text-stone-3 mt-0.5 md:mt-0.5 leading-snug md:leading-normal">
              {desc}
            </div>
          </div>
        </div>
      </div>

      {/* CTA — full-width below on mobile, right-aligned button on desktop */}
      <button
        type="button"
        onClick={onClick}
        className={`${
          variant === "critical"
            ? "bg-clay border border-clay text-white"
            : "border border-ochre text-ochre bg-transparent"
        } w-full md:w-auto py-token-3 md:py-1.5 px-token-6 md:px-token-6 rounded-token-3 text-body md:text-meta font-semibold whitespace-nowrap text-center cursor-pointer`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

/** Tiny i18n helper — collapses 1 vs N forms. Used for "1 critical item" vs
 * "3 critical items". Keeps copy logic in one place. */
function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
