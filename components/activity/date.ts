import type { ActivityRowVariant } from "./types";

/**
 * Format a row date the way the mockup does it.
 *
 * Desktop rows have room for the year ("5/9/2026"); mobile rows trade it for
 * density ("5/9"). Anything we can't parse passes through verbatim so a
 * malformed feed entry doesn't render as "NaN/NaN".
 */
export function formatActivityDate(
  iso: string,
  variant: ActivityRowVariant,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (variant === "desktop") {
    return `${month}/${day}/${d.getFullYear()}`;
  }
  return `${month}/${day}`;
}
