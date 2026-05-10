/**
 * Pure helpers for the Avatar component. Kept in their own file (no React,
 * no DOM) so they can be unit-tested with `node:test` on plain TypeScript
 * without needing a React renderer.
 *
 * The Avatar palette has 8 entries (--av-1 … --av-8) defined in app/tokens.css.
 */

export const AVATAR_TOKEN_COUNT = 8;

/**
 * Sum char codes mod 8 — simple, stable, no dependencies. A given handle
 * always lands on the same bucket, regardless of process or runtime.
 */
export function hashHandle(handle: string): number {
  let sum = 0;
  for (let i = 0; i < handle.length; i++) sum += handle.charCodeAt(i);
  return sum % AVATAR_TOKEN_COUNT;
}

/**
 * Returns the 1-indexed avatar token index (1..8) for a given handle.
 * The CSS variable name is `--av-${index}`.
 */
export function getAvatarTokenIndex(handle: string): number {
  return hashHandle(stripHandlePrefix(handle)) + 1;
}

/**
 * Strip a leading "@" from a social handle, if present.
 */
export function stripHandlePrefix(handle: string): string {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

/**
 * Pull 1–2 initials. Prefers displayName ("Maria Torres" -> "MT"); falls back
 * to splitting the handle on common separators ("m_torres_42" -> "MT").
 *
 * Always returns uppercase. Returns "?" only if neither input has any letters
 * — defensive, so the avatar never renders empty.
 */
export function getInitials(opts: {
  handle: string;
  displayName?: string | null;
}): string {
  const source = opts.displayName?.trim()
    ? opts.displayName
    : stripHandlePrefix(opts.handle);

  // Split on whitespace, underscore, dot, or dash. Drop tokens with no letters
  // so trailing numeric segments ("42") don't become initials.
  const tokens = source
    .split(/[\s_.\-]+/)
    .filter((t) => /[a-zA-Z]/.test(t));

  if (tokens.length === 0) return "?";

  if (tokens.length === 1) {
    // Single word — take the first letter only. Acceptance criterion only
    // expects 1-2 chars, and "Alice" -> "A" is the conventional choice.
    return tokens[0].charAt(0).toUpperCase();
  }

  // Multi-word — first letter of first two tokens.
  return (tokens[0].charAt(0) + tokens[1].charAt(0)).toUpperCase();
}
