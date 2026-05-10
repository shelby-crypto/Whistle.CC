"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActivityItem, Tier } from "./types";
import { TIERS } from "@/lib/tiers";
import { useActivityFeed } from "./useActivityFeed";
import { useUnprocessed } from "./useUnprocessed";

import TierSectionHeader from "@/components/TierSectionHeader";
import SectionError from "@/components/SectionError";
import ActivityRow from "./ActivityRow";
import ErrorBanner from "./ErrorBanner";
import FilterTabs, { parseFilter } from "./FilterTabs";
import CalibrationModal, {
  type CalibrationSubmitResult,
} from "./CalibrationModal";
import Toast, { type ToastTone } from "@/components/Toast";
import SearchBar from "./SearchBar";
import { useResponsiveVariant } from "./useResponsiveVariant";

/**
 * Render order for tier sections. Always Critical → Removed → Calibrate;
 * empty tiers are skipped at the render layer (see below).
 */
const TIER_ORDER: ReadonlyArray<Tier> = ["critical", "removed", "calibrate"];

/**
 * The action-column header label per tier on the desktop column row. Three
 * sections, three labels: critical surfaces *Status* of the preserved
 * evidence, removed surfaces the *Action* taken on the post, calibrate
 * surfaces *Your input* (the rating affordance).
 */
const ACTION_HEADER_LABEL: Record<Tier, string> = {
  critical: "Status",
  removed: "Action",
  calibrate: "Your input",
};

interface Props {
  /**
   * Items to render. When omitted, the component fetches via
   * `useActivityFeed`. Passing items explicitly is supported for tests and
   * Storybook-style stubs that need a deterministic dataset.
   */
  items?: ActivityItem[];
  /**
   * Number of items that hit a processing error this session. When
   * omitted, the component reads the count from `useUnprocessed`. Pass
   * a number (including 0) to override — useful in tests or for the
   * mockup-parity hardcoded fallback.
   */
  unprocessedCount?: number;
}

/**
 * The body of the /activity page. Reads the active filter from `?tier=`,
 * groups items by tier in fixed display order, hands rows to the
 * variant-aware ActivityRow, and routes Save evidence / Rate via the page's
 * handlers.
 *
 * Three independent data paths run in parallel:
 *   - `useActivityFeed`  → top 50 activity rows (one query, no refetch on tab change)
 *   - `useUnprocessed`   → count of pipeline_runs with classifier failures
 *   - `searchParams`     → URL filter state
 *
 * Each fail-path renders inline at its section level. The page never
 * crashes; the worst case is one section is replaced with a "Try again"
 * block while the rest of the feed continues to work.
 */
export default function ActivityFeed({
  items: itemsProp,
  unprocessedCount,
}: Props) {
  const variant = useResponsiveVariant();
  const isMobile = variant === "mobile";

  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = parseFilter(searchParams.get("tier"));

  const [rateItem, setRateItem] = useState<ActivityItem | null>(null);
  /**
   * Items optimistically removed from the Calibrate section after a successful
   * rating submit. Stored as a Set of ids so we can drop them in O(1) and
   * still re-add quickly if the RPC errors after the modal has already closed.
   */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  /**
   * Single-toast slot — the parent owns the message; Toast handles auto-
   * dismiss and renders nothing when null.
   */
  const [toast, setToast] = useState<{
    message: string;
    tone: ToastTone;
  } | null>(null);

  // Hooks always run (rules of hooks). When the caller passed items we
  // ignore the fetched result entirely — the items prop wins.
  const fetched = useActivityFeed();
  const rawItems = itemsProp ?? fetched.items;
  // Apply optimistic hides — same array reference when the set is empty so
  // the byTier memo below is a no-op on the common path.
  const items =
    hiddenIds.size === 0
      ? rawItems
      : rawItems.filter((it) => !hiddenIds.has(it.id));
  const loading = itemsProp ? false : fetched.loading;
  const fetchError = itemsProp ? null : fetched.error;
  const refresh = fetched.refresh;

  const unprocessed = useUnprocessed();
  const errorCount =
    typeof unprocessedCount === "number"
      ? unprocessedCount
      : unprocessed.count;

  // Group once per render. Bucketing is O(N), the feed is bounded — no
  // useMemo needed for correctness, but it lets us read the per-tier counts
  // in the header without re-filtering.
  const byTier = useMemo(() => {
    const groups: Record<Tier, ActivityItem[]> = {
      critical: [],
      removed: [],
      calibrate: [],
    };
    for (const item of items) groups[item.tier].push(item);
    return groups;
  }, [items]);

  // Tiers visible after applying the URL filter. "all" → every non-empty
  // tier in canonical order; a specific tier → just that one.
  const tiersToRender: Tier[] =
    filter === "all" ? [...TIER_ORDER] : [filter];

  /**
   * Row click and the Critical-tier "Save evidence" button both route to the
   * dedicated Evidence Preservation view at /activity/[id]/evidence. We
   * forward the active tier filter via `?tier=` so the back link on that view
   * returns the athlete to the same Activity tab they came from
   * (Critical → Critical, All → All).
   */
  const handleOpen = (item: ActivityItem) => {
    const qs = filter !== "all" ? `?tier=${filter}` : "";
    router.push(`/activity/${item.id}/evidence${qs}`);
  };
  const handleSaveEvidence = handleOpen;
  const handleRate = (item: ActivityItem) => {
    setRateItem(item);
  };

  /**
   * Called by CalibrationModal after the rating RPC has resolved. We close
   * the modal, optimistically drop the row from the Calibrate section, and
   * surface the success toast — in that order so the visual flow reads
   * "submit → modal closes → row gone → confirmation".
   *
   * The optimistic hide is a Set toggle, not a refetch — switching tabs or
   * refreshing pulls the canonical state from `useActivityFeed`.
   */
  const handleSubmitted = useCallback(
    (result: CalibrationSubmitResult) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(result.itemId);
        return next;
      });
      setRateItem(null);
      setToast({
        message: "Rating saved. Whistle will use this to learn your line.",
        tone: "success",
      });
    },
    [],
  );

  /**
   * Called when the rating RPC errors. The optimistic-hide hasn't run yet
   * (we only flip `hiddenIds` on success), so all we need to do is surface
   * the failure. The modal itself stays open so the athlete can retry —
   * losing the form state on transient failure would be hostile.
   */
  const handleSubmitError = useCallback((message: string) => {
    setToast({
      message: `Couldn't save your rating: ${message}`,
      tone: "error",
    });
  }, []);

  const goToAll = () => router.replace("/activity", { scroll: false });

  return (
    <>
      {isMobile && <MobileAppHeader />}
      {isMobile && <FilterTabs variant="mobile" />}

      <div
        className={
          isMobile
            ? "px-token-8 pt-token-6 pb-token-12"
            : "max-w-[960px] mx-auto px-token-12 pt-token-11 pb-token-12"
        }
      >
        {!isMobile && (
          <>
            <h1
              className="font-serif font-normal text-stone mb-token-5"
              style={{ fontSize: "var(--fs-display)" }}
            >
              Activity
            </h1>
            <div className="mt-token-6">
              <FilterTabs variant="desktop" />
            </div>
            <SearchBar />
          </>
        )}

        {/* Section-level error for the activity-list fetch. The
            "Try again" button re-runs the underlying query — switching
            tabs is still instant because tier filtering is client-side. */}
        {fetchError && (
          <SectionError
            what="Activity feed"
            error={fetchError}
            onRetry={refresh}
          />
        )}

        {/* Processing-error banner — driven by `count_processing_errors()`
            via the useUnprocessed hook. Hidden when the count is zero; the
            banner re-fetches the count after retry so it disappears once
            the queue clears. */}
        {errorCount > 0 && (
          <ErrorBanner count={errorCount} onRetry={() => unprocessed.retry()} />
        )}

        {/* If retry itself failed, surface the reason inline so the
            athlete knows the queue wasn't actually cleared. */}
        {unprocessed.retryError && (
          <SectionError
            what="Retry"
            error={unprocessed.retryError}
            onRetry={() => unprocessed.retry()}
          />
        )}

        {/* Loading skeleton: 5 placeholder rows on All, fewer on a tier
            filter (the underlying data is the same one fetch — the
            filter just hides what's already loaded). */}
        {loading && items.length === 0 ? (
          <ActivitySkeleton isMobile={isMobile} rowCount={5} />
        ) : items.length === 0 && !fetchError ? (
          // Zero rows, fetch succeeded — show the friendly empty state.
          // Two flavors: green-dot "all clear" for the unfiltered view,
          // tier-specific "No items in X" with a back-to-All link for
          // a filtered view.
          filter === "all" ? (
            <AllClearEmpty />
          ) : (
            <FilteredEmpty tier={filter} onBack={goToAll} />
          )
        ) : (
          tiersToRender.map((tier) => {
            const tierItems = byTier[tier];

            // Filtered tier with zero matching items — render the
            // tier-specific empty state instead of nothing, so the
            // user understands the filter is what's hiding rows.
            if (tierItems.length === 0) {
              if (filter === tier) {
                return (
                  <FilteredEmpty key={tier} tier={tier} onBack={goToAll} />
                );
              }
              // Empty tiers in the All view are silently skipped — per spec.
              return null;
            }

            return (
              <section
                key={tier}
                aria-label={`${tier} activity`}
                className={
                  isMobile
                    ? "mb-token-5"
                    : "mb-token-7 rounded-token-4 overflow-hidden border border-line"
                }
              >
                <TierSectionHeader
                  tier={tier}
                  count={tierItems.length}
                  compact={isMobile}
                />

                {!isMobile && (
                  <DesktopColumnHeader actionLabel={ACTION_HEADER_LABEL[tier]} />
                )}

                {tierItems.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    variant={variant}
                    onOpen={handleOpen}
                    onSaveEvidence={handleSaveEvidence}
                    onRate={handleRate}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>

      <CalibrationModal
        item={rateItem}
        onClose={() => setRateItem(null)}
        onSubmitted={handleSubmitted}
        onSubmitError={handleSubmitError}
      />

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "success"}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}

/**
 * The mobile app-header bar: page title on the left, search icon on the
 * right. The icon is decorative for now — Prompt 9 (or later) will wire it
 * to surface the SearchBar in a sheet or drawer.
 */
function MobileAppHeader() {
  return (
    <header
      className={[
        "flex justify-between items-center",
        "px-token-8 pt-token-2 pb-token-4 border-b border-line",
      ].join(" ")}
    >
      <h1
        className="font-serif font-normal text-stone"
        style={{ fontSize: "var(--fs-h2)" }}
      >
        Activity
      </h1>
      <button
        type="button"
        aria-label="Search"
        className={[
          "w-8 h-8 rounded-full bg-ink-3 border border-line",
          "flex items-center justify-center text-meta text-stone-3",
          "cursor-pointer hover:bg-ink-2",
        ].join(" ")}
        onClick={() => {
          // eslint-disable-next-line no-console
          console.log("[ActivityFeed] mobile search tapped");
        }}
      >
        🔍
      </button>
    </header>
  );
}

/**
 * The little uppercase column-header row that sits between the gradient
 * tier header and the data rows on desktop. Mirrors `.row.head` in the
 * mockup: same 7-column grid, smaller font, no border-top.
 */
function DesktopColumnHeader({ actionLabel }: { actionLabel: string }) {
  return (
    <div
      className={[
        "grid items-center gap-token-4 px-token-8 py-[9px]",
        "text-stone-4 text-micro uppercase tracking-[0.6px] font-semibold",
        "grid-cols-[28px_220px_1fr_80px_90px_110px_70px]",
      ].join(" ")}
      style={{ background: "#0F141A" }}
      aria-hidden
    >
      <div />
      <div>Author</div>
      <div>Content</div>
      <div>Platform</div>
      <div>Type</div>
      <div>{actionLabel}</div>
      <div>Date</div>
    </div>
  );
}

/**
 * First-load skeleton — N placeholder rows sized to a real activity row.
 * The default of 5 matches the spec for the All view; callers can override
 * if a tier-only fetch wants a tighter placeholder set.
 */
function ActivitySkeleton({
  isMobile,
  rowCount = 5,
}: {
  isMobile: boolean;
  rowCount?: number;
}) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading activity…</span>
      <section
        className={
          isMobile
            ? "mb-token-5"
            : "mb-token-7 rounded-token-4 overflow-hidden border border-line"
        }
      >
        {/* Header strip placeholder — sits where the gradient tier
            header would appear in the loaded view. */}
        <div className="h-[44px] bg-ink-3" />
        <div className="bg-ink-2">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-token-4 px-token-6 md:px-token-8 py-token-5 border-t border-line"
            >
              {/* Avatar placeholder */}
              <div className="w-7 h-7 rounded-full bg-ink-3 shrink-0" />
              <div className="flex-1">
                <div className="h-[12px] w-1/3 bg-ink-3 rounded-token-2 mb-2" />
                <div className="h-[10px] w-2/3 bg-ink-3 rounded-token-2" />
              </div>
              {/* Right-side action placeholder */}
              <div className="hidden md:block h-[28px] w-[88px] bg-ink-3 rounded-token-2" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Unfiltered empty state — happens for new athletes before the first
 * scan, or once everyone has been classified as "none". Mirrors the
 * StatusLine green-dot treatment so the message reads as a continuation
 * of "you're protected", not as broken UI.
 */
function AllClearEmpty() {
  return (
    <div
      className="rounded-token-3 px-token-5 py-token-6 flex items-center gap-token-4 border"
      style={{
        background: "rgba(45, 212, 191, 0.08)",
        borderColor: "rgba(45, 212, 191, 0.3)",
      }}
      role="status"
    >
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full bg-champagne flex-shrink-0"
        style={{ boxShadow: "0 0 0 4px rgba(45, 212, 191, 0.15)" }}
      />
      <span className="text-body text-stone">
        All clear. Nothing has been caught yet.
      </span>
    </div>
  );
}

/**
 * Filter-specific empty state — "No items in [tier]" with a back-to-All
 * link so the athlete can recover from a filter that hides everything.
 */
function FilteredEmpty({
  tier,
  onBack,
}: {
  tier: Tier;
  onBack: () => void;
}) {
  const meta = TIERS[tier];
  return (
    <div
      className="rounded-token-4 border border-dashed border-line-2 bg-ink-2 px-token-6 py-token-10 text-center"
      role="status"
    >
      <p className="text-stone-2 text-body mb-1">
        No items in {meta.title}.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="text-meta text-champagne underline-offset-2 hover:underline cursor-pointer bg-transparent"
      >
        See all activity
      </button>
    </div>
  );
}
