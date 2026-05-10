"use client";

import { useState } from "react";

interface Props {
  /**
   * Called on every keystroke. Wired in the activity page but inert at the
   * data layer for now — search filtering across content is out of beta scope.
   */
  onChange?: (value: string) => void;
  placeholder?: string;
}

/**
 * The search input that sits above the activity feed sections.
 *
 * Style mirrors `.search` in the desktop mockup: dark fill, 1px line-2
 * border, 13px DM Sans, magnifier glyph as an inline prefix. Inert at the
 * filter layer for now (we surface keystrokes via `onChange` so a parent
 * can wire it later), but already focusable and keyboard-accessible.
 */
export default function SearchBar({
  onChange,
  placeholder = "Search content...",
}: Props) {
  const [value, setValue] = useState("");
  return (
    <label
      className={[
        "flex items-center gap-token-3 bg-ink-2 border border-line-2",
        "rounded-token-3 px-token-6 py-[11px] mb-token-6",
        "text-stone-4 text-body cursor-text",
        "focus-within:border-stone-3 transition-colors",
      ].join(" ")}
    >
      {/* Magnifier glyph — purely decorative; the input below carries the label */}
      <span aria-hidden className="text-stone-4 text-body shrink-0">
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
        }}
        placeholder={placeholder}
        aria-label="Search activity content"
        className={[
          "flex-1 bg-transparent border-none outline-none",
          "text-stone text-body font-sans placeholder:text-stone-4",
        ].join(" ")}
      />
    </label>
  );
}
