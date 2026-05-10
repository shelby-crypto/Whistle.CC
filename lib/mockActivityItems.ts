/**
 * Mock data for the Activity feed page.
 *
 * Shape matches the spec verbatim: `id`, `tier`, `author { displayName,
 * handle }`, `platform`, `date`, `isRepeat`. Two extra optional fields are
 * pinned per author for mockup parity: `initials` (the hand-curated 2-char
 * label) and `avatarSlot` (the specific palette color). These keep the dev
 * experience matching the design mockup; production data won't have them
 * set and will fall back to the deterministic hash.
 *
 * This file will be replaced by a Supabase query in Prompt 8 — the page
 * itself imports from `@/lib/mockActivityItems` so swapping the source
 * later doesn't ripple into UI code.
 */

import type { ActivityItem } from "@/components/activity/types";

export const MOCK_ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: "1",
    tier: "critical",
    author: {
      displayName: "M. Torres",
      handle: "m_torres_42",
      initials: "MT",
      avatarSlot: 1,
    },
    platform: "instagram",
    date: "2026-05-09",
    isRepeat: true,
  },
  {
    id: "2",
    tier: "removed",
    author: {
      displayName: "truebluefan ⚽",
      handle: "truebluefan_98",
      initials: "TB",
      avatarSlot: 3,
    },
    platform: "instagram",
    date: "2026-04-30",
    isRepeat: false,
  },
  {
    id: "3",
    tier: "removed",
    author: {
      displayName: "M. Torres",
      handle: "m_torres_42",
      initials: "MT",
      avatarSlot: 1,
    },
    platform: "instagram",
    date: "2026-05-09",
    isRepeat: true,
  },
  {
    id: "4",
    tier: "removed",
    author: {
      displayName: "Jasmine R.",
      handle: "jazzy_r",
      initials: "JR",
      avatarSlot: 4,
    },
    platform: "instagram",
    date: "2026-05-09",
    isRepeat: false,
  },
  {
    id: "5",
    tier: "calibrate",
    author: {
      displayName: "Coach D.",
      handle: "coachd_takes",
      initials: "CD",
      avatarSlot: 2,
    },
    platform: "twitter",
    date: "2026-05-08",
    isRepeat: false,
  },
  {
    id: "6",
    tier: "calibrate",
    author: {
      displayName: "sportsdebatehq",
      handle: "sportsdebatehq",
      initials: "SD",
      avatarSlot: 7,
    },
    platform: "twitter",
    date: "2026-05-09",
    isRepeat: false,
  },
];
