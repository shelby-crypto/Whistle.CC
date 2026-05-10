"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import Avatar from "@/components/Avatar";
import type { ActivityItem } from "./types";
import { defaultActionLabel } from "./types";
import { formatActivityDate } from "./date";
import { RepeatFlag } from "./ActivityRowDesktop";

interface Props {
  item: ActivityItem;
  /** Activates the row → opens detail view (logged for now). */
  onOpen?: (item: ActivityItem) => void;
  /** Called when the critical-tier "Save evidence" button is clicked. */
  onSaveEvidence?: (item: ActivityItem) => void;
  /** Called when the calibrate-tier "Rate" button is clicked. */
  onRate?: (item: ActivityItem) => void;
}

/**
 * The mobile (Option C density) variant. Optimized so all 6 mockup items fit
 * on one phone screen without scrolling.
 *
 *   28 (avatar) | 1fr (text stack) | auto (right action)
 *
 * Right column behaviour:
 *   - critical  → green "Save evidence" button
 *   - calibrate → ochre outline "Rate" button
 *   - removed   → just the date in muted color (no button, no status pill)
 *
 * Border treatment matches `.activity-card` in the mockup: every row has L,
 * R, B borders plus a top border, with the first row's top border removed
 * so it sits flush against the gradient TierSectionHeader above.
 */
export default function ActivityRowMobile({
  item,
  onOpen,
  onSaveEvidence,
  onRate,
}: Props) {
  const { id, tier, author, platform, date, isRepeat } = item;
  const action = item.action ?? defaultActionLabel(tier, "mobile");

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

  // Compose the single meta line. Critical/calibrate include the date here;
  // removed pushes the date to the right column and drops it from the meta.
  const handleStr = `@${author.handle.replace(/^@/, "")}`;
  const metaLine =
    tier === "removed"
      ? `${handleStr} · ${platform}`
      : `${handleStr} · ${platform} · ${formatActivityDate(date, "mobile")}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKey}
      className={[
        "grid items-center gap-token-3 bg-ink-2 px-token-4 py-[9px]",
        // L/R/B always; T on every row except the first so the first row
        // sits flush against the gradient TierSectionHeader above it.
        "border border-line border-t first:border-t-0 cursor-pointer",
        // Round the bottom corners of the last card so the section's outline
        // closes cleanly under the rows.
        "last:rounded-b-token-3",
        "transition-colors hover:bg-ink-3 focus:bg-ink-3 outline-none",
        "grid-cols-[28px_1fr_auto]",
      ].join(" ")}
      data-activity-id={id}
    >
      <Avatar
        handle={author.handle}
        displayName={author.displayName}
        initials={author.initials}
        tokenIndex={author.avatarSlot}
        size={28}
      />

      {/* author + meta */}
      <div className="min-w-0 overflow-hidden">
        <div className="flex items-center gap-token-2 text-stone text-body font-medium whitespace-nowrap overflow-hidden">
          <span className="truncate">{author.displayName}</span>
          {isRepeat && <RepeatFlag size="mobile" />}
        </div>
        <div className="text-stone-4 text-micro whitespace-nowrap overflow-hidden text-ellipsis mt-px">
          {metaLine}
        </div>
      </div>

      {/* right action */}
      <div onClick={stop} className="shrink-0">
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
              "bg-transparent text-ochre border border-ochre px-[11px] py-[5px]",
              "rounded-token-2 text-micro font-semibold cursor-pointer",
              "hover:bg-ochre/10 focus:outline-none focus:ring-2 focus:ring-ochre/50",
            ].join(" ")}
          >
            {action}
          </button>
        )}
        {tier === "removed" && (
          <span className="text-stone-4 text-micro">
            {formatActivityDate(date, "mobile")}
          </span>
        )}
      </div>
    </div>
  );
}
