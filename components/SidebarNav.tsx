"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";

/**
 * Desktop sidebar nav. Visible only on `md` and up (the AppShell hides the
 * containing `<aside>` below 768px).
 *
 * Active-state contract:
 *   - Champagne text + a subtle elevated background (`--ink-3`) for the
 *     row whose href matches the current route.
 *   - Inactive rows use `--stone-3` text with a hover lift to `--stone-2`.
 *
 * Match rule mirrors BottomNav: exact match for "/" so it doesn't claim
 * every URL, prefix match for everything else.
 */
export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex items-center gap-3 px-3 py-2.5 rounded-lg",
              "text-sm font-medium transition-colors",
            ].join(" ")}
            style={{
              color: active ? "var(--champagne)" : "var(--stone-3)",
              background: active ? "var(--ink-3)" : "transparent",
            }}
          >
            <span aria-hidden className="block">
              {item.icon(active)}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
