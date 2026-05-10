"use client";

import type { SocialListeningSettings } from "@/lib/userSettings";

/**
 * Section 1 — Social Listening card.
 *
 * Two controls inside one card:
 *   1. A free-text "Search Query" input. Acts as the keyword the polling
 *      pipeline uses to surface posts; empty string is allowed (no extra
 *      keyword filter applied).
 *   2. A pill-style platform multi-select. Twitter / Instagram / Reddit;
 *      one or more can be active simultaneously. (Reddit isn't wired into
 *      the poller yet — the toggle is forward-compatible UI.)
 *
 * Persistence is owned by the parent (`/protection/page.tsx`) — this
 * component is fully controlled. The parent debounces the query input
 * and writes the platform set immediately on click.
 */
const PLATFORMS: ReadonlyArray<{
  key: keyof SocialListeningSettings["platforms"];
  label: string;
}> = [
  { key: "twitter", label: "Twitter" },
  { key: "instagram", label: "Instagram" },
  { key: "reddit", label: "Reddit" },
];

export interface SocialListeningProps {
  value: SocialListeningSettings;
  onChangeQuery: (next: string) => void;
  onTogglePlatform: (
    key: keyof SocialListeningSettings["platforms"],
    next: boolean,
  ) => void;
}

export default function SocialListening({
  value,
  onChangeQuery,
  onTogglePlatform,
}: SocialListeningProps) {
  return (
    <section className="mb-token-12">
      <h2 className="text-body md:text-base font-semibold text-stone mb-token-4">
        Social Listening
      </h2>

      <div className="rounded-token-4 border border-line bg-ink-2 p-token-7">
        {/* Search Query */}
        <label className="block">
          <span className="block text-meta text-stone-3 mb-1.5">
            Search Query
          </span>
          <input
            type="text"
            value={value.searchQuery}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="Enter search query or keyword"
            className="w-full rounded-token-3 border border-line-2 bg-ink-3 px-token-5 py-token-4 text-body text-stone placeholder:text-stone-4 focus:outline-none focus:border-champagne transition-colors"
          />
        </label>

        {/* Platforms — multi-select pill chips */}
        <div className="mt-token-5">
          <span className="block text-meta text-stone-3 mb-token-2">
            Platforms
          </span>
          <div className="flex flex-wrap gap-token-2">
            {PLATFORMS.map((p) => {
              const active = value.platforms[p.key];
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onTogglePlatform(p.key, !active)}
                  aria-pressed={active}
                  className={`px-token-6 py-1.5 rounded-full text-meta font-medium transition-colors ${
                    active
                      ? "bg-champagne text-ink font-semibold"
                      : "bg-transparent text-stone-3 border border-line-2"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
