"use client";

import { useRouter } from "next/navigation";
import type { ScannedSummary } from "@/lib/mockDashboardData";

/**
 * Section 4 — the slim "scanned posts" footer row.
 *
 * Single line of copy with the running total of posts Whistle has analysed,
 * plus a chevron-style arrow to suggest there's a destination behind it.
 * Routes to `/audit-log` (placeholder — Prompt 8 will land the real audit
 * log view; for now the page can render a 404 or the route can be wired to
 * a stub).
 *
 * The component renders identically on desktop and mobile because the row
 * is already minimal — only the typography scale changes via tokens.
 */
export default function ScannedCard({
  scanned,
}: {
  scanned: ScannedSummary;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/audit-log")}
      className="w-full rounded-token-4 border border-line bg-ink-2 px-token-6 md:px-token-7 py-3 mb-token-11 flex justify-between items-center text-left cursor-pointer hover:bg-ink-3 transition-colors"
      aria-label="View audit log"
    >
      <span className="text-meta md:text-meta text-stone-3">
        Whistle has scanned{" "}
        <strong className="font-semibold text-stone-2">
          {formatCount(scanned.totalPostsScanned)} posts
        </strong>{" "}
        across your accounts
      </span>
      <span className="text-base font-bold text-stone-2 leading-none ml-token-3">
        →
      </span>
    </button>
  );
}

/** Format a count with comma separators ("2341" → "2,341"). Localized to
 * en-US to keep the rendering deterministic for snapshot/visual tests. */
function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
