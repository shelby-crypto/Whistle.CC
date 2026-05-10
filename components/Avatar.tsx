/**
 * Avatar — initials-only, deterministic-color avatar.
 *
 * Visual reference: `.avatar` in whistle_DESKTOP_1.html.
 *
 * Phase 1: initials + a hashed background from the --av-1..--av-8 token
 * palette. Phase 2 (not in this prompt) will layer real profile images on top
 * once the platform APIs are wired.
 *
 * No image fallback, no online indicator, no hover state — by request.
 */

import * as React from "react";
import { getAvatarTokenIndex, getInitials } from "./avatarUtils";

export interface AvatarProps {
  /** Social handle, e.g. "m_torres_42" or "@m_torres_42". Required because
   * the deterministic color depends on it. */
  handle: string;
  /** Friendly name. When present it drives the initials ("Maria Torres" -> "MT"). */
  displayName?: string | null;
  /** Diameter in px. Font size scales with this. */
  size?: number;
  /**
   * Override for the 2-character initials. When provided, beats both
   * `displayName` and the handle-derived fallback. Use this for hand-curated
   * cases like "truebluefan ⚽" → "TB" where the algorithm would emit "T".
   */
  initials?: string;
  /**
   * Override for the avatar palette slot (1–8). When provided, beats the
   * handle-derived hash. Use this to pin a specific color for a known
   * author (e.g., to match a mockup). Out-of-range values fall back to the
   * hash so a bad input never blanks the avatar.
   */
  tokenIndex?: number;
  /** Pass-through for layout-level styling (margin, etc.). Internal styles
   * always win. */
  className?: string;
}

export default function Avatar({
  handle,
  displayName,
  size = 32,
  initials: initialsOverride,
  tokenIndex: tokenIndexOverride,
  className,
}: AvatarProps) {
  const initials = initialsOverride
    ? initialsOverride.slice(0, 2).toUpperCase()
    : getInitials({ handle, displayName });
  const hashedIndex = getAvatarTokenIndex(handle);
  const tokenIndex =
    typeof tokenIndexOverride === "number" &&
    tokenIndexOverride >= 1 &&
    tokenIndexOverride <= 8
      ? tokenIndexOverride
      : hashedIndex;

  // Reference's .avatar uses font-size: 12px at size: 32px → ratio 0.375. The
  // spec asks for ~0.34, which reads slightly tighter inside the circle. Using
  // 0.34 and rounding to whole px keeps text crisp at small sizes.
  const fontSize = Math.round(size * 0.34);

  return (
    <span
      className={className}
      aria-label={displayName ?? handle}
      title={displayName ?? handle}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `var(--av-${tokenIndex})`,
        color: "#fff",
        fontFamily: "var(--font-sans)",
        fontSize,
        fontWeight: 600,
        letterSpacing: "0.3px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        userSelect: "none",
        lineHeight: 1,
      }}
    >
      {initials}
    </span>
  );
}
