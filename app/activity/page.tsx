import { Suspense } from "react";
import type { Metadata } from "next";
import ActivityFeed from "@/components/activity/ActivityFeed";

export const metadata: Metadata = {
  title: "Activity — Whistle",
  description:
    "Review the protection events Whistle handled across your accounts.",
};

/**
 * /activity — the main moderation feed.
 *
 * Server component on purpose: it renders fast (no client JS needed for
 * the initial paint), then hydrates `<ActivityFeed>` which reads the URL
 * filter state. The Suspense boundary is mandatory in Next 15 because
 * `<ActivityFeed>` calls `useSearchParams()` — without it the page-level
 * static generation throws.
 *
 * The unprocessed-count and the activity items are sourced from real
 * Supabase queries (`useUnprocessed` + `useActivityFeed`) inside
 * `ActivityFeed`. Pass `unprocessedCount` here only if you want to
 * override the live count for visual review.
 */
export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityFeed />
    </Suspense>
  );
}
