"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import SidebarNav from "@/components/SidebarNav";
import OfflineBanner from "@/components/OfflineBanner";

/**
 * Single shell wrapping every authenticated page.
 *
 * Layout contract — desktop (≥ 768px):
 *   - Sidebar fixed on the left (224px wide), independently scrollable
 *     when its contents exceed the viewport height.
 *   - Main column to the right of the sidebar, full height, scrolls on
 *     its own.
 *   - No bottom nav (the sidebar replaces it).
 *
 * Layout contract — mobile (< 768px):
 *   - No sidebar.
 *   - A thin top header with the Whistle wordmark (so the brand stays
 *     visible without dedicating real estate to a sidebar).
 *   - A fixed bottom tab bar (BottomNav) with the four primary routes.
 *     The tab bar reserves `env(safe-area-inset-bottom)` so the iPhone
 *     home indicator never overlaps the controls.
 *   - Main content scrolls and is padded at the bottom by enough to
 *     clear the tab bar — see `pb-[…]` on the page-content `<div>`.
 *
 * Public pages (login, auth callback, error) bypass the shell entirely
 * via the `isPublicPage` short-circuit so the marketing-style routes
 * don't inherit the app chrome.
 *
 * The OfflineBanner is rendered above everything so the offline notice
 * surfaces over both shell variants without per-page wiring.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Public pages that should render without the app shell
  const isPublicPage =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (isPublicPage) {
    return (
      <>
        <OfflineBanner />
        {children}
      </>
    );
  }

  return (
    <>
      <OfflineBanner />

      {/* Outer flex stretches to the full viewport. The sidebar and main
          column both inherit that height — the main column then scrolls
          internally so the sidebar stays put. */}
      <div className="flex h-full">
        {/* Desktop sidebar. Hidden below 768px (where BottomNav takes
            over). `overflow-y-auto` lets it scroll independently when
            the nav grows past the viewport — important once we add more
            secondary links or admin shortcuts. */}
        <aside
          className={[
            "hidden md:flex md:flex-col md:w-56",
            "md:border-r md:border-line md:bg-ink-2",
            "md:px-4 md:py-6 md:gap-1 flex-shrink-0",
            "md:h-full md:overflow-y-auto",
          ].join(" ")}
        >
          <div className="mb-8 px-2 flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--champagne)" }}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="var(--ink)"
                aria-hidden
              >
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight text-stone">
                Whistle
              </span>
              <span className="text-[10px] text-stone-4">Your Protection</span>
            </div>
          </div>
          <SidebarNav />
        </aside>

        {/* Main column. Owns its own scroll so the sidebar stays put.
            Bottom padding clears the fixed BottomNav on mobile —
            `5.25rem` is `h-14` (56px) + iOS home indicator slack. The
            extra `env(safe-area-inset-bottom)` adapts to iPhones with a
            home indicator vs. older ones without. */}
        <main
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          {/* Mobile-only top header — small wordmark so the brand is
              still visible without giving up content height. */}
          <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line bg-ink-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "var(--champagne)" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5"
                  fill="var(--ink)"
                  aria-hidden
                >
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight text-stone">
                Whistle
              </span>
            </div>
          </header>

          {/* Page content. The `pb` rule below stacks two values:
                - h-14 (56px) clears the bottom tab bar height
                - env(safe-area-inset-bottom) clears the iPhone home indicator
              CSS `calc()` adds them in one declaration. The `md:` modifier
              wipes the padding back to 0 on desktop since the bottom nav
              isn't rendered there. */}
          <div className="flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
        </main>
      </div>

      {/* Fixed mobile tab bar. Rendered outside the flex container so its
          `position: fixed` is anchored to the viewport regardless of any
          ancestor `transform` / `overflow` rules. */}
      <BottomNav />
    </>
  );
}
