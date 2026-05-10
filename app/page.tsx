import type { Metadata } from "next";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard — Whistle",
  description:
    "Your protection dashboard — what's waiting on you, recent activity, and 14-day trend.",
};

/**
 * "/" — the app's landing route.
 *
 * Renders the same Dashboard composition served from `/dashboard` so a user
 * who hits the root URL doesn't get bounced through a redirect on every
 * load. The `<Dashboard>` client component composes the six dashboard
 * sections in spec order; data wiring lives in `lib/mockDashboardData.ts`
 * until Prompt 8 swaps it for live Supabase aggregations.
 *
 * The previous Supabase-driven Protection Dashboard at this path is
 * superseded by the redesigned tier-led layout. The legacy data fetches
 * (pipeline_runs feed, realtime subscriptions) move to the new sections
 * once the data layer is wired up.
 */
export default function HomePage() {
  return <Dashboard />;
}
