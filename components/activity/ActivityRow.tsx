"use client";

import type { ActivityItem, ActivityRowVariant } from "./types";
import ActivityRowDesktop from "./ActivityRowDesktop";
import ActivityRowMobile from "./ActivityRowMobile";
import { useResponsiveVariant } from "./useResponsiveVariant";

interface Props {
  item: ActivityItem;
  /**
   * Force a specific variant. Omit to auto-detect from viewport width via
   * `useResponsiveVariant`. Forcing is useful for tests, Storybook, and the
   * dev mockup pages where both variants render side-by-side.
   */
  variant?: ActivityRowVariant;
  onOpen?: (item: ActivityItem) => void;
  onSaveEvidence?: (item: ActivityItem) => void;
  onRate?: (item: ActivityItem) => void;
}

/**
 * Top-level ActivityRow. Picks the desktop or mobile variant based on the
 * `variant` prop (when provided) or the current viewport width (when not).
 *
 * The two variants share types, action callbacks, and avatar/initials
 * derivation — but their layouts diverge enough (7-column grid vs single-row
 * Option C density) that splitting was cleaner than a single conditional
 * monster. Both call back into the same `onOpen`/`onSaveEvidence`/`onRate`
 * handlers so the parent doesn't care which variant rendered.
 */
export default function ActivityRow({
  item,
  variant,
  onOpen,
  onSaveEvidence,
  onRate,
}: Props) {
  const detected = useResponsiveVariant();
  const resolved = variant ?? detected;

  if (resolved === "mobile") {
    return (
      <ActivityRowMobile
        item={item}
        onOpen={onOpen}
        onSaveEvidence={onSaveEvidence}
        onRate={onRate}
      />
    );
  }

  return (
    <ActivityRowDesktop
      item={item}
      onOpen={onOpen}
      onSaveEvidence={onSaveEvidence}
      onRate={onRate}
    />
  );
}

// Re-export the moving parts so callers can `import { ActivityItem } from
// '@/components/activity/ActivityRow'` without reaching into types.ts.
export type {
  ActivityItem,
  ActivityRowVariant,
  Tier,
  ActivityAuthor,
  AvatarSlot,
} from "./types";
export { ActivityRowDesktop, ActivityRowMobile };
