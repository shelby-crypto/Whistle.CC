import Link from "next/link";
import type { Metadata } from "next";

interface PageProps {
  // Next 15 makes route params async; await before reading.
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Evidence — Whistle",
  description: "Preserved evidence detail view.",
};

/**
 * /evidence/[id] — placeholder.
 *
 * Wired so the Critical-tier "Save evidence" button on the Activity feed
 * navigates somewhere instead of dead-ending. The real detail view —
 * preserved post, classifier rationale, downloadable evidence bundle,
 * "share with law enforcement" handoff — lands in a later prompt.
 *
 * For now we just confirm the routing wire (id round-trips from the URL)
 * and offer a back link.
 */
export default async function EvidenceDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="max-w-[720px] mx-auto px-token-12 py-token-12 text-stone">
      <Link
        href="/activity"
        className="text-stone-3 text-meta hover:text-stone-2 transition-colors"
      >
        ← Back to Activity
      </Link>

      <h1
        className="font-serif font-normal text-stone mt-token-6 mb-token-3"
        style={{ fontSize: "var(--fs-display)" }}
      >
        Evidence detail view — coming soon
      </h1>
      <p className="text-stone-3 text-body mb-token-8">
        Item <span className="text-stone-2 font-mono">{id}</span> would
        normally show its preserved post, the classifier&rsquo;s harm
        breakdown, and a one-click handoff to your designated point of
        contact. The full view ships in a later prompt.
      </p>

      <div className="bg-ink-2 border border-line rounded-token-4 p-token-8">
        <div className="text-stone-4 text-micro uppercase tracking-[0.6px] mb-token-3">
          Placeholder
        </div>
        <p className="text-stone-2 text-body leading-relaxed">
          Wiring check: the id from the route param is{" "}
          <span className="text-stone font-mono">{id}</span>, which means
          the Save evidence button on the Activity feed reached this page
          with the right item context.
        </p>
      </div>
    </main>
  );
}
