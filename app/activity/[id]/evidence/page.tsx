import Link from "next/link";
import type { Metadata } from "next";
import Avatar from "@/components/Avatar";
import TierBadge from "@/components/TierBadge";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TIERS, type Tier } from "@/lib/tiers";
import { formatActivityDate } from "@/components/activity/date";

interface PageProps {
  // Next 15 makes both params and searchParams async; await before reading.
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tier?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Evidence Preservation — Whistle",
  description:
    "Save evidence Whistle preserved for you and prepare it to share with law enforcement.",
};

/**
 * Shape of the single row we read from `activity_items`. Mirrors the columns
 * pulled in `useActivityFeed`, but only the fields this view needs. RLS in
 * the underlying view scopes the query to the current athlete — no manual
 * `.eq("athlete_id", ...)` here on purpose (see useActivityFeed.ts for the
 * same rationale).
 */
interface EvidenceRow {
  id: string;
  tier: Tier;
  author_handle: string | null;
  author_display_name: string | null;
  platform: string;
  created_at: string;
}

/**
 * Whitelist of valid filter values for the back link. Matches `parseFilter`
 * in `components/activity/FilterTabs.tsx` — kept as a literal here so this
 * server component doesn't have to import a "use client" module.
 */
function safeTierParam(value: string | string[] | undefined): Tier | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "critical" || v === "removed" || v === "calibrate") return v;
  return null;
}

/**
 * /activity/[id]/evidence — placeholder Critical detail view.
 *
 * Wired so the Critical-tier "Save evidence" button on the Activity feed
 * lands somewhere meaningful instead of dead-ending. The full seven-part
 * evidence package (chain of custody, technical metadata, classifier
 * rationale, downloadable bundle, law-enforcement handoff) lands in a
 * dedicated future session — this view only proves out the routing wire
 * and surfaces the item's basic context.
 *
 * Critically, this view never surfaces the harmful content text itself.
 * The protected-by-default blur bar below stands in for the preserved
 * post until the redaction-aware viewer ships.
 *
 * The back link preserves the active tier filter via `?tier=` so an
 * athlete tapping Save evidence from the Critical tab returns to the
 * Critical tab, not All.
 */
export default async function ActivityEvidencePage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const fromTier = safeTierParam(sp.tier);

  // Build the back URL. Default to /activity (the All view) when no filter
  // was active; otherwise round-trip the same `?tier=` param the feed reads.
  const backHref = fromTier ? `/activity?tier=${fromTier}` : "/activity";
  const backLabel = fromTier
    ? `Back to ${TIERS[fromTier].title}`
    : "Back to Activity";

  // RLS-scoped fetch. If the row isn't visible to the current athlete (or the
  // session is missing), `data` comes back null and we fall through to a
  // graceful placeholder rather than a 404 — the routing wire still proves
  // out and the athlete can still read the page subtitle / get back to the
  // feed.
  let row: EvidenceRow | null = null;
  try {
    const supabase = await getSupabaseServer();
    const { data } = await supabase
      .from("activity_items")
      .select(
        "id, tier, author_handle, author_display_name, platform, created_at",
      )
      .eq("id", id)
      .maybeSingle<EvidenceRow>();
    row = data ?? null;
  } catch {
    // Network / config issue — fall through to placeholder. Logging would
    // belong here once the app's logging story is in place.
    row = null;
  }

  // Resolve display fields with sensible fallbacks so the page always renders
  // a recognisable card even if the row lookup returned nothing.
  const tier: Tier = row?.tier ?? "critical";
  const handle = row?.author_handle ?? "unknown";
  const displayName =
    row?.author_display_name && row.author_display_name !== "Unknown"
      ? row.author_display_name
      : handle;
  const platform = row?.platform ?? "—";
  const dateLabel = row?.created_at
    ? formatActivityDate(row.created_at, "desktop")
    : "—";

  return (
    <main
      className={[
        "max-w-[720px] mx-auto",
        "px-token-6 md:px-token-12",
        "pt-token-6 md:pt-token-11",
        "pb-token-12",
        "text-stone",
      ].join(" ")}
    >
      {/* Back link — preserves the active tier filter so the athlete returns
          to the same Activity tab they came from. */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-token-2 text-stone-3 text-meta hover:text-stone-2 transition-colors"
      >
        <span aria-hidden>←</span>
        {backLabel}
      </Link>

      {/* Page header */}
      <header className="mt-token-6 mb-token-8">
        <h1
          className="font-serif font-normal text-stone mb-token-3"
          style={{ fontSize: "var(--fs-display)" }}
        >
          Evidence Preservation
        </h1>
        <p className="text-stone-3 text-body leading-relaxed max-w-[560px]">
          This view will let you save evidence and prepare it to share with
          law enforcement.
        </p>
      </header>

      {/* Item context card — avatar, author, handle, platform, date, tier
          badge, redacted content blur bar. The whole card stays inside the
          720px max-width and reflows cleanly at 375px. */}
      <section
        aria-label="Activity item details"
        className={[
          "bg-ink-2 border border-line rounded-token-4",
          "p-token-6 md:p-token-8",
          "mb-token-8",
        ].join(" ")}
      >
        {/* Top row: avatar + author block on the left, tier badge on the right.
            On mobile the badge wraps below if names are long; on desktop it
            stays right-aligned. */}
        <div className="flex items-start gap-token-4">
          <Avatar
            handle={handle}
            displayName={displayName}
            size={40}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-token-3">
              <span
                className="text-stone font-medium truncate"
                style={{ fontSize: "var(--fs-h3)" }}
              >
                {displayName}
              </span>
              <TierBadge tier={tier} />
            </div>
            <div className="text-stone-4 text-meta mt-token-1 truncate">
              @{handle.replace(/^@/, "")}
            </div>
          </div>
        </div>

        {/* Meta row: platform + date. Inline with a separator on desktop,
            stacks naturally at 375px because flex-wrap is on. */}
        <div className="flex flex-wrap items-center gap-x-token-3 gap-y-token-1 mt-token-5">
          <span className="text-stone-3 text-meta lowercase">{platform}</span>
          <span className="text-stone-4 text-meta" aria-hidden>
            ·
          </span>
          <span className="text-stone-3 text-meta">{dateLabel}</span>
        </div>

        {/* Redacted content area — protective default. The actual harmful
            text never surfaces here; the blur bar communicates "preserved
            but hidden" without re-exposing the athlete to the content.
            Fixed-height block scales with the card width and stays legible
            (visually) at 375px. */}
        <div className="mt-token-6">
          <div className="text-stone-4 text-micro uppercase tracking-[0.6px] mb-token-3">
            Preserved content
          </div>
          <div
            role="img"
            aria-label="Hidden harmful content — Whistle preserved this for evidence"
            className={[
              "w-full rounded-token-3 border border-line",
              "h-[88px] md:h-[112px]",
              "flex items-center justify-center px-token-6",
            ].join(" ")}
            style={{
              background:
                "linear-gradient(90deg, var(--line) 0%, var(--line-2) 30%, var(--line) 60%, var(--line-2) 90%)",
              opacity: 0.7,
            }}
          >
            <span className="sr-only">
              Whistle preserved this content as evidence. The text is hidden
              by default to protect you.
            </span>
            <span
              aria-hidden
              className="text-stone-4 text-micro uppercase tracking-[0.8px]"
            >
              Hidden by default
            </span>
          </div>
          <p className="text-stone-4 text-meta mt-token-3 leading-relaxed">
            Whistle keeps the harmful text hidden by default. The full
            redaction-aware viewer ships with the evidence package.
          </p>
        </div>
      </section>

      {/* Action row. The download button is intentionally disabled — the
          actual evidence package generation, chain-of-custody, and bundle
          export land in a dedicated future session. */}
      <div
        className={[
          "flex flex-col-reverse md:flex-row md:items-center md:justify-between",
          "gap-token-4",
        ].join(" ")}
      >
        <p className="text-stone-4 text-meta leading-relaxed max-w-[420px]">
          You&rsquo;ll be able to bundle the preserved post, the classifier
          context, and a chain-of-custody record into one downloadable
          package once this view is fully built.
        </p>

        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming soon"
          className={[
            "shrink-0 rounded-token-3 border border-line-2",
            "px-token-6 py-token-3",
            "text-meta font-semibold",
            "bg-ink-3 text-stone-4",
            "cursor-not-allowed opacity-70",
            // No hover/focus affordance — the button is non-interactive.
          ].join(" ")}
        >
          Download evidence package · Coming soon
        </button>
      </div>
    </main>
  );
}
