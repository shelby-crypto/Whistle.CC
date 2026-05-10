/**
 * TierSectionHeader — gradient bar that introduces a tier section.
 *
 * Visual references:
 *   - desktop: `.section-header.{critical|removed|calibrate}` in whistle_DESKTOP_1.html
 *   - mobile:  `.tier-section-header.{critical|removed|calibrate}` in whistle_MOBILE_FINAL.html
 *
 * Mobile-vs-desktop differences are real: padding, font sizes, AND subtitle
 * copy differ. Because copy can't be swapped via CSS media queries alone,
 * the caller chooses with the `compact` prop.
 *
 * All tier copy and color mapping comes from `lib/tiers.ts`. Edit a title
 * there and every section header re-renders with the new value.
 */

import * as React from "react";
import { TIERS, tierGradient, type Tier } from "@/lib/tiers";

export interface TierSectionHeaderProps {
  tier: Tier;
  /** Number of items in the section. Rendered in the right-side count chip. */
  count: number;
  /**
   * `true`  → mobile/cramped variant (smaller padding, shorter subtitle)
   * `false` → desktop variant (default)
   *
   * Per the design tokens spec, layout breakpoints are owned by Tailwind
   * (`md:` = 768px). Callers typically render two headers and toggle them
   * with `md:hidden` / `hidden md:flex`, OR pass `compact` from a state hook
   * that tracks the breakpoint. Either pattern keeps this component pure.
   */
  compact?: boolean;
  className?: string;
}

export default function TierSectionHeader({
  tier,
  count,
  compact = false,
  className,
}: TierSectionHeaderProps) {
  const meta = TIERS[tier];
  const subtitle = compact ? meta.subtitleCompact : meta.subtitle;

  // Padding, font sizes, and count-chip styling come straight from the two
  // mockups. Keeping them inline (rather than via a Tailwind variant) means
  // the component renders the same in any consumer regardless of CSS scope.
  const padY = compact ? 10 : 14;
  const padX = compact ? 14 : 20;
  const titleSize = compact ? 13 : 15;
  const subSize = compact ? 11 : 12;
  const countSize = compact ? 11 : 12;
  const countPad = compact ? "2px 9px" : "3px 11px";
  const countRadius = compact ? 12 : 14;

  return (
    <div
      className={className}
      style={{
        padding: `${padY}px ${padX}px`,
        background: tierGradient(tier),
        color: "#fff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        // Mobile mockup rounds only the top corners (rests on top of the
        // section list); desktop variant lives inside a `.section` wrapper
        // that already clips with `overflow: hidden`, so square corners
        // here render correctly inside both.
        borderRadius: compact ? "8px 8px 0 0" : 0,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: titleSize,
            lineHeight: 1.2,
          }}
        >
          {meta.title}
        </div>
        <div
          style={{
            fontSize: subSize,
            color: "rgba(255, 255, 255, 0.78)",
            fontWeight: 400,
            marginTop: compact ? 1 : 2,
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </div>
      </div>

      <span
        // Count chip — translucent white over the gradient.
        style={{
          background: "rgba(255, 255, 255, 0.18)",
          borderRadius: countRadius,
          padding: countPad,
          fontSize: countSize,
          fontWeight: 500,
          flexShrink: 0,
          marginLeft: 12,
          // Format with locale separators once we cross 1,000.
        }}
        aria-label={`${count} items`}
      >
        {count.toLocaleString()}
      </span>
    </div>
  );
}
