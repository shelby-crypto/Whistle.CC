"use client";

import { useRouter } from "next/navigation";

/**
 * Section 3 — Monitoring Windows.
 *
 * Lightweight Phase-1 implementation: heading, "Create" button on the
 * right, and a dashed-border empty state card. The list rendering and
 * Create flow are deferred to Phase 2 (a follow-up prompt) per the spec.
 *
 * The Create button currently routes to `/protection/windows/new` —
 * a placeholder route that doesn't exist yet. When Phase 2 ships, that
 * route should land a modal or full page; today it 404s. The behavior
 * here is intentional: the button needs to look real and report a
 * destination so the rest of the page can be tested in isolation.
 */
export default function MonitoringWindows() {
  const router = useRouter();

  return (
    <section className="mb-token-7">
      <header className="flex justify-between items-center mb-token-4">
        <h2 className="text-body md:text-base font-semibold text-stone">
          Monitoring Windows
        </h2>
        <button
          type="button"
          onClick={() => router.push("/protection/windows/new")}
          className="bg-champagne text-ink rounded-token-3 px-token-6 md:px-token-7 py-token-2 md:py-token-2 text-meta font-semibold whitespace-nowrap"
        >
          <span className="hidden md:inline">Create Monitoring Window</span>
          <span className="md:hidden">+ Create</span>
        </button>
      </header>

      {/* Dashed-border empty state. Switches to a regular border when the
          windows list is populated (Phase 2). */}
      <div className="rounded-token-4 border border-dashed border-line-2 bg-ink-2 px-token-6 py-token-12 text-center">
        <p className="text-stone-2 text-body mb-1">
          No monitoring windows set up yet
        </p>
        <p className="text-stone-4 text-micro">
          Create one for game days, events, or high-profile moments
        </p>
      </div>
    </section>
  );
}
