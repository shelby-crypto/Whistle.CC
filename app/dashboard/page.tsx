import type { Metadata } from "next";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard — Whistle",
  description:
    "Your protection dashboard — what's waiting on you, recent activity, and 14-day trend.",
};

/**
 * /dashboard — landing route for the protected app.
 *
 * Server component — no data fetching today (the mock dataset lives in
 * `lib/mockDashboardData.ts`). When Supabase aggregations replace the mock,
 * any server-side fetches will happen here and pass typed slices into the
 * <Dashboard> client component.
 *
 * The same composition is also exported from `app/page.tsx` so users
 * landing on "/" see the dashboard without an extra redirect; the duplicate
 * route exists for direct deep-links and analytics that pin to /dashboard.
 */
export default function DashboardPage() {
  return <Dashboard />;
}
