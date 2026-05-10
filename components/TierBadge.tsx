/**
 * TierBadge — small pill that names the tier in lowercase.
 *
 * Visual reference: the `.badge` / `.badge-critical|removed|calibrate`
 * classes in whistle_DESKTOP_1.html.
 *
 * Color is the only signal — no icons, no border. All tier copy and color
 * mapping comes from `lib/tiers.ts`; this component owns layout only.
 */

import * as React from "react";
import { TIERS, type Tier } from "@/lib/tiers";

export interface TierBadgeProps {
  tier: Tier;
  /** Pass-through for layout-level styling (margin, alignment). Internal
   * styles always win over collisions. */
  className?: string;
}

export default function TierBadge({ tier, className }: TierBadgeProps) {
  const meta = TIERS[tier];

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        padding: "3px 11px",
        borderRadius: 12,
        background: `var(${meta.colorVar})`,
        color: "#fff",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.2px",
        textTransform: "lowercase",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {meta.badgeLabel}
    </span>
  );
}
