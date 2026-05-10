/**
 * Avatar — initials-only avatar with optional profile-image overlay.
 *
 * Visual reference: `.avatar` in whistle_DESKTOP_1.html.
 *
 * Behaviour:
 *   - Initials rendered onto a deterministic palette slot (--av-1..--av-8)
 *     derived from `handle`. This is always present so the avatar never
 *     blanks out, even before an image loads.
 *   - When `imageUrl` is provided, an <img> is layered on top of the
 *     initials disc. If the image fails to load (404, CORS, blocked host,
 *     etc.) we drop it and fall back to the initials — same component, no
 *     layout shift.
 *
 * `<img>` is used directly (not next/image) so callers can pass arbitrary
 * remote URLs without needing the Next image-domain allowlist. Trade-off:
 * no automatic resizing or AVIF/WebP optimization. Acceptable for avatar
 * thumbnails at 32–48px.
 */

"use client";

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
  /**
   * Optional profile-image URL. When supplied and the image loads
   * successfully, it covers the initials disc. On load error the component
   * silently reverts to initials.
   */
  imageUrl?: string | null;
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
  imageUrl,
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

  // Image-load failure tracking. When `imageUrl` changes we reset, so a fresh
  // URL gets a fresh attempt even if a prior one 404'd.
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const showImage = !!imageUrl && !imgFailed;

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
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Initials are always rendered underneath so the disc is never blank
          while the image is loading or after it errors out. */}
      <span aria-hidden={showImage ? true : undefined}>{initials}</span>

      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element -- we want
        // unrestricted remote URLs without configuring the Next image domains
        // allowlist; perf cost is negligible at avatar thumbnail sizes.
        <img
          src={imageUrl ?? undefined}
          alt=""
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      )}
    </span>
  );
}
