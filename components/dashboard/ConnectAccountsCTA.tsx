"use client";

import { useRouter } from "next/navigation";

/**
 * Onboarding CTA for the dashboard's zero-account state.
 *
 * Renders above the dashboard sections when an authenticated athlete has
 * zero rows in `platform_tokens`. Per spec, we don't auto-redirect — the
 * page still surfaces the (zero-state) sections below so the athlete sees
 * what's coming. The CTA points to /connect, which already exists as the
 * social-account-linking flow.
 *
 * Visual style mirrors the StatusLine "you're protected" banner inverted —
 * same dimensions, but champagne/teal-tinted to read as "let's get
 * started" rather than alarm.
 */
export default function ConnectAccountsCTA() {
  const router = useRouter();

  return (
    <div
      role="region"
      aria-label="Connect your social accounts"
      className="rounded-token-4 mb-token-8 px-token-6 py-token-6 flex flex-col md:flex-row md:items-center md:justify-between gap-token-4 border"
      style={{
        background: "rgba(45, 212, 191, 0.08)",
        borderColor: "rgba(45, 212, 191, 0.3)",
      }}
    >
      <div className="leading-snug">
        <p className="text-body font-semibold text-stone mb-1">
          Connect your first social account
        </p>
        <p className="text-meta text-stone-3">
          Whistle starts monitoring as soon as you link a Twitter or Instagram
          account. Your dashboard fills in within a few minutes after.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push("/connect")}
        className="bg-champagne text-ink rounded-token-3 px-token-7 py-token-3 text-meta font-semibold whitespace-nowrap shrink-0"
      >
        Connect an account →
      </button>
    </div>
  );
}
