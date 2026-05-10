"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";

/**
 * Bottom tab bar — mobile only (`md:hidden`).
 *
 * Layout contract:
 *   - Fixed to the bottom of the viewport so it stays visible regardless
 *     of scroll position.
 *   - z-index 40: above page content (`z-30` and below) and the sticky
 *     dashboard header (`z-40`); below modals (`z-50`) and the
 *     OfflineBanner notification.
 *   - Bottom padding uses `env(safe-area-inset-bottom)` so the iPhone
 *     home indicator never overlaps the tab labels. Page content gets
 *     `pb-[var(--bottom-nav-h)]` to match — see AppShell.
 *
 * Active-state contract:
 *   - The route whose `href` matches the current pathname is highlighted
 *     in `--champagne` (the brand teal). Inactive items use `--stone-3`.
 *   - Match rule: exact match (`/`) or "starts with the href" so
 *     `/activity?tier=critical` still highlights the Activity tab.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink border-t border-line"
      // The tab bar height is published as a CSS variable so the page
      // content layer can pad correctly without hardcoding the value in
      // two places. Includes the iOS home-indicator inset so we don't
      // need to compute it again upstream.
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="flex items-stretch h-14">
        {NAV_ITEMS.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "h-full flex flex-col items-center justify-center gap-0.5",
                  "text-[10px] font-medium transition-colors",
                ].join(" ")}
                style={{
                  color: active ? "var(--champagne)" : "var(--stone-3)",
                }}
              >
                <span aria-hidden className="block">
                  {item.icon(active)}
                </span>
                <span className="truncate max-w-full px-0.5">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Active-route matcher. Exact equality for "/" (so other routes don't
 * inadvertently match the home tab), prefix match for everything else
 * so `/activity?tier=critical` and `/activity/123` keep Activity active.
 */
function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
