"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import Avatar from "@/components/Avatar";
import TierBadge from "@/components/TierBadge";
import type { ActivityItem } from "./types";
import { defaultActionLabel } from "./types";
import { formatActivityDate } from "./date";

interface Props {
  item: ActivityItem;
  /**
   * Called when the user activates the row (click or Enter/Space). The
   * detail-view route isn't wired yet, so the dispatcher logs to console
   * by default — wire this up when Prompt 11 lands.
   */
  onOpen?: (item: ActivityItem) => void;
  /** Called when the critical-tier "Save evidence" button is clicked. */
  onSaveEvidence?: (item: ActivityItem) => void;
  /** Called when the calibrate-tier "Rate this" button is clicked. */
  onRate?: (item: ActivityItem) => void;
}

/**
 * The desktop table-row variant of the activity feed item.
 *
 * Grid: 28 (checkbox) | 220 (author) | 1fr (blur) | 80 (platform) | 90
 * (badge) | 110 (action) | 70 (date). Hover lightens to --ink-3.
 *
 * The whole row acts as a button (route to detail view); inner buttons stop
 * propagation so the action click doesn't also open the detail.
 *
 * Avatar circle and tier badge come from the shared `Avatar` and `TierBadge`
 * components — same components used elsewhere in the app, so editing tier
 * copy in `lib/tiers.ts` re-renders both surfaces consistently.
 */
export default function ActivityRowDesktop({
  item,
  onOpen,
  onSaveEvidence,
  onRate,
}: Props) {
  const { id, tier, author, platform, date, isRepeat } = item;
  const action = item.action ?? defaultActionLabel(tier, "desktop");

  const handleOpen = () => {
    if (onOpen) {
      onOpen(item);
    } else {
      // eslint-disable-next-line no-console
      console.log("[ActivityRow] open detail for", id);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  // Stop the row's onClick from firing when the user interacts with
  // checkbox / button cells.
  const stop = (e: MouseEvent) => e.stopPropagation();

  const handleSave = (e: MouseEvent) => {
    e.stopPropagation();
    if (onSaveEvidence) {
      onSaveEvidence(item);
    } else {
      // eslint-disable-next-line no-console
      console.log("[ActivityRow] save evidence for", id);
    }
  };

  const handleRate = (e: MouseEvent) => {
    e.stopPropagation();
    if (onRate) {
      onRate(item);
    } else {
      // eslint-disable-next-line no-console
      console.log("[ActivityRow] rate", id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKey}
      className={[
        "grid items-center gap-token-4 px-token-8 py-token-4",
        "bg-ink-2 border-t border-line text-body cursor-pointer",
        "transition-colors hover:bg-ink-3 focus:bg-ink-3 outline-none",
        "grid-cols-[28px_220px_1fr_80px_90px_110px_70px]",
      ].join(" ")}
      data-activity-id={id}
    >
      {/* checkbox — rendering only; bulk action wiring lands in a later prompt */}
      <div
        onClick={stop}
        className="w-[14px] h-[14px] rounded-token-1 border border-line-2"
        aria-hidden
      />

      {/* author */}
      <div className="grid grid-cols-[32px_1fr] items-center gap-token-3 min-w-0">
        <Avatar
          handle={author.handle}
          displayName={author.displayName}
          initials={author.initials}
          tokenIndex={author.avatarSlot}
          size={32}
        />
        <div className="flex flex-col gap-px min-w-0">
          <div className="flex items-center gap-token-2 text-stone text-body font-medium whitespace-nowrap overflow-hidden">
            <span className="truncate">{author.displayName}</span>
            {isRepeat && <RepeatFlag size="desktop" />}
          </div>
          <div className="text-stone-4 text-micro truncate">
            @{author.handle.replace(/^@/, "")}
          </div>
        </div>
      </div>

      {/* blur bar — content is hidden by design until the user opens the detail view */}
      <div className="flex items-center min-w-0">
        <div
          className="w-[180px] h-2 rounded-[4px] opacity-70"
          style={{
            background:
              "linear-gradient(90deg, var(--line) 0%, var(--line-2) 30%, var(--line) 60%, var(--line-2) 90%)",
          }}
          aria-label="Hidden harmful content"
          role="img"
        />
      </div>

      {/* platform */}
      <div className="text-stone-3 text-meta lowercase truncate">{platform}</div>

      {/* tier badge */}
      <div>
        <TierBadge tier={tier} />
      </div>

      {/* action — varies by tier */}
      <div onClick={stop}>
        {tier === "critical" && (
          <button
            type="button"
            onClick={handleSave}
            className={[
              "bg-champagne text-ink border-0 px-[11px] py-[5px]",
              "rounded-token-2 text-micro font-semibold cursor-pointer",
              "hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-champagne/50",
            ].join(" ")}
          >
            {action}
          </button>
        )}
        {tier === "calibrate" && (
          <button
            type="button"
            onClick={handleRate}
            className={[
              "bg-transparent text-ochre border border-ochre",
              "px-[11px] py-[4px] rounded-token-2 text-micro font-semibold cursor-pointer",
              "hover:bg-ochre/10 focus:outline-none focus:ring-2 focus:ring-ochre/50",
            ].join(" ")}
          >
            {action}
          </button>
        )}
        {tier === "removed" && (
          <span className="text-stone-2 text-meta">{action}</span>
        )}
      </div>

      {/* date */}
      <div className="text-stone-4 text-meta">
        {formatActivityDate(date, "desktop")}
      </div>
    </div>
  );
}

/**
 * Small clay-tinted "REPEAT" pill rendered inline next to the display name
 * when `item.isRepeat === true`. Two sizes — desktop (9px) and mobile (8px)
 * — to keep the inline rhythm tight at smaller font sizes.
 */
function RepeatFlag({ size }: { size: "desktop" | "mobile" }) {
  const isMobile = size === "mobile";
  return (
    <span
      className="bg-clay/20 text-clay font-bold uppercase rounded-token-1 shrink-0"
      style={{
        fontSize: isMobile ? "8px" : "9px",
        padding: isMobile ? "1px 4px" : "1px 5px",
        letterSpacing: "0.4px",
      }}
    >
      REPEAT
    </span>
  );
}

export { RepeatFlag };
