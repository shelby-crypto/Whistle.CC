import type { Metadata } from "next";
import ProtectionPage from "@/components/protection/ProtectionPage";

export const metadata: Metadata = {
  title: "Protection Settings — Whistle",
  description:
    "Configure how Whistle protects your online presence — listening keywords, auto-protection rules, and monitoring windows.",
};

/**
 * /protection — athlete-facing protection settings.
 *
 * Server component shell that renders the client `<ProtectionPage>`.
 * The client component owns state + persistence via `useUserSettings`,
 * which talks to Supabase's `user_settings` table directly under RLS.
 *
 * The legacy `/settings` page (allowlist + concerning/worth-watching
 * toggles + monitoring window modal) remains live until its content is
 * migrated; this new route is the redesigned, tier-aware replacement
 * for the auto-protection portion.
 */
export default function Protection() {
  return <ProtectionPage />;
}
