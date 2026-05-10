import Link from "next/link";
import type { Metadata } from "next";
import Avatar from "@/components/Avatar";
import TierBadge from "@/components/TierBadge";
import { getSupabaseServer } from "@/lib/supabase/server";
import { TIERS, type Tier } from "@/lib/tiers";
import { formatActivityDate } from "@/components/activity/date";
import RemovedContentReveal from "@/components/activity/RemovedContentReveal";
import {
  summarizeRemovalReason,
  type HarmScoresBlob,
} from "@/lib/harm-labels";
import { resolveAuthorIdentity } from "@/lib/demo-authors";

interface PageProps {
  // Next 15 makes both params and searchParams async; await before reading.
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tier?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Activity detail — Whistle",
  description:
    "Inspect a Whistle-classified post — preserve evidence for Critical items or review what was removed.",
};

/**
 * Shape of the single row we read from `activity_items`. Mirrors the columns
 * pulled in `useActivityFeed`, plus `content` (added here for the Removed
 * detail view's blurred reveal). RLS in the underlying view scopes the query
 * to the current athlete — no manual `.eq("athlete_id", ...)` here on purpose
 * (see useActivityFeed.ts for the same rationale).
 */
interface DetailRow {
  id: string;
  tier: Tier;
  author_handle: string | null;
  author_display_name: string | null;
  platform: string;
  created_at: string;
  content: string | null;
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
 * /activity/[id]/evidence — tier-aware detail view.
 *
 * Two flavors, dispatched by `row.tier`:
 *   - tier='critical'  → Evidence Preservation view. Routing wire only for
 *     now; the seven-part evidence package (chain of custody, technical
 *     metadata, classifier rationale, downloadable bundle, law-enforcement
 *     handoff) lands in a dedicated future session.
 *   - tier='removed'   → Removed-content detail. Surfaces the post author,
 *     a click-to-reveal blurred copy of the content, and a one-sentence
 *     reason summarizing which harm categories tripped the classifier.
 *   - tier='calibrate' → No detail view yet; we fall through to a small
 *     placeholder card rather than dead-ending.
 *
 * The back link preserves the active tier filter via `?tier=` so an athlete
 * tapping a row from the Critical tab returns to the Critical tab.
 */
export default async function ActivityDetailPage({
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
  let row: DetailRow | null = null;
  // Removed-tier-only: classifier output for the "why removed" sentence.
  let classifierOutput: HarmScoresBlob | null = null;
  try {
    const supabase = await getSupabaseServer();
    const { data } = await supabase
      .from("activity_items")
      .select(
        "id, tier, author_handle, author_display_name, platform, created_at, content",
      )
      .eq("id", id)
      .maybeSingle<DetailRow>();
    row = data ?? null;

    // For removed rows we want the specific harm-category reasoning. The
    // activity_items view doesn't expose classifier_output (kept lean for the
    // feed), so pull it from pipeline_runs directly. `activity_items.id` is
    // `pipeline_runs.id` (see migration 006), so we can reuse the same id.
    if (row?.tier === "removed") {
      const { data: prData } = await supabase
        .from("pipeline_runs")
        .select("classifier_output")
        .eq("id", id)
        .maybeSingle<{ classifier_output: HarmScoresBlob | null }>();
      classifierOutput = prData?.classifier_output ?? null;
    }
  } catch {
    // Network / config issue — fall through to placeholder. Logging would
    // belong here once the app's logging story is in place.
    row = null;
  }

  // Resolve display fields with sensible fallbacks so the page always renders
  // a recognisable card even if the row lookup returned nothing.
  const tier: Tier = row?.tier ?? "critical";

  // Resolve the demo author identity. The activity_items view doesn't yet
  // expose display name or profile-image columns, and Instagram-polled
  // comments arrive with the placeholder handle "instagram_user". The
  // resolver (lib/demo-authors.ts) maps known seed-demo handles to
  // hand-curated identities and synthesises a deterministic identity for
  // the placeholder, keyed by the row id so the same row always renders the
  // same fake person. Delete once the real `author_display_name` /
  // `author_avatar_url` columns ship.
  const identity = resolveAuthorIdentity(row?.author_handle, id);
  const handle = identity.handle;
  const displayName = identity.displayName;
  const avatarUrl = identity.avatarUrl;
  const platform = row?.platform ?? "—";
  const dateLabel = row?.created_at
    ? formatActivityDate(row.created_at, "desktop")
    : "—";

  // Page header copy varies by tier so the screen self-describes what kind
  // of detail the athlete is looking at.
  const header =
    tier === "removed"
      ? {
          title: "Removed content",
          subtitle:
            "Whistle removed this post for you. Here's who posted it, what it said, and why.",
        }
      : {
          title: "Evidence Preservation",
          subtitle:
            "This view will let you save evidence and prepare it to share with law enforcement.",
        };

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
          {header.title}
        </h1>
        <p className="text-stone-3 text-body leading-relaxed max-w-[560px]">
          {header.subtitle}
        </p>
      </header>

      {/* Item context card — avatar, author, handle, platform, date, tier
          badge, plus a tier-specific body. The whole card stays inside the
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
            imageUrl={avatarUrl}
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

        {/* Tier-specific body. Critical keeps the protective "preserved but
            hidden" placeholder; Removed surfaces the click-to-reveal viewer
            and a one-sentence reason. */}
        {tier === "removed" ? (
          <>
            <RemovedContentReveal content={row?.content ?? ""} />
            <RemovedReason classifierOutput={classifierOutput} />
          </>
        ) : (
          <CriticalEvidenceBlur />
        )}
      </section>

      {/* Action row — Critical only. For Removed there's nothing to download
          and no next-step action; the section card above is the entire view. */}
      {tier === "critical" && (
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
      )}
    </main>
  );
}

/**
 * Protective placeholder for Critical-tier detail. We never surface the
 * harmful text directly here — the blur bar communicates "preserved but
 * hidden" without re-exposing the athlete. The full redaction-aware viewer
 * ships with the evidence package work.
 */
function CriticalEvidenceBlur() {
  return (
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
          Whistle preserved this content as evidence. The text is hidden by
          default to protect you.
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
  );
}

/**
 * "Why this was removed" line for Removed-tier rows. Prefers the specific
 * harm-category sentence built from `classifier_output.harm_scores`; falls
 * back to the generic tier subtitle when the classifier blob is missing or
 * scored nothing actionable (rare, but worth a graceful fallback).
 */
function RemovedReason({
  classifierOutput,
}: {
  classifierOutput: HarmScoresBlob | null;
}) {
  const specific = summarizeRemovalReason(classifierOutput);
  const sentence = specific
    ? `Whistle removed this post for ${specific}.`
    : `Whistle removed this post under ${TIERS.removed.subtitle.toLowerCase()}.`;

  return (
    <div className="mt-token-6">
      <div className="text-stone-4 text-micro uppercase tracking-[0.6px] mb-token-3">
        Why this was removed
      </div>
      <p className="text-stone-2 text-body leading-relaxed">{sentence}</p>
    </div>
  );
}
