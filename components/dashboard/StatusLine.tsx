"use client";

import type { DashboardStatus } from "@/lib/mockDashboardData";

/**
 * Section 1 — the "You're protected." status banner that opens the dashboard.
 *
 * Desktop renders one horizontal line with the green pulse, the headline,
 * and 2-3 metadata pieces separated by vertical pipes. Mobile breaks the
 * same content into stacked lines (status + metadata + window) so it fits
 * on a 380px wide phone without truncation.
 *
 * The "Game day window — ends in Xh" piece is conditional: when
 * `status.window` is null the divider drops with it so the line still
 * reads cleanly.
 *
 * Color tokens come from tokens.css — the rgba values are the literal
 * `--champagne` hue at 0.08 and 0.3 alpha, matching the mockup spec.
 */
export default function StatusLine({ status }: { status: DashboardStatus }) {
  const hasWindow = status.window !== null;

  return (
    <div
      className="rounded-token-3 mb-token-8 px-token-5 py-3"
      style={{
        background: "rgba(45, 212, 191, 0.08)",
        border: "1px solid rgba(45, 212, 191, 0.3)",
      }}
    >
      {/* Desktop: single horizontal line with pipes between meta pills. */}
      <div className="hidden md:flex md:items-center md:gap-token-6">
        <Dot />
        <span className="text-body font-medium text-stone">
          You&apos;re protected.
        </span>
        <Divider />
        <Meta>
          <strong className="font-medium text-stone-2">
            {status.accountsMonitored} accounts
          </strong>{" "}
          monitored across {status.platformsLabel}
        </Meta>
        <Divider />
        <Meta>
          Last scan{" "}
          <strong className="font-medium text-stone-2">
            {status.lastScanMinutesAgo} min ago
          </strong>
        </Meta>
        {hasWindow && (
          <>
            <Divider />
            <Meta>
              {status.window!.label} —{" "}
              <strong className="font-medium text-stone-2">
                ends in {status.window!.endsInHours}h
              </strong>
            </Meta>
          </>
        )}
      </div>

      {/* Mobile: 3 stacked lines (status, account/scan combined, window). */}
      <div className="md:hidden">
        <div className="flex items-center gap-token-3">
          <Dot />
          <span className="text-body font-medium text-stone">
            You&apos;re protected.
          </span>
        </div>
        <div className="text-micro pl-[18px] text-stone-3 leading-normal">
          <strong className="font-medium text-stone-2">
            {status.accountsMonitored} accounts
          </strong>{" "}
          on {status.platformsLabel} · Last scan{" "}
          <strong className="font-medium text-stone-2">
            {status.lastScanMinutesAgo} min ago
          </strong>
        </div>
        {hasWindow && (
          <div className="text-micro pl-[18px] mt-0.5 leading-normal text-champagne">
            {status.window!.label} — ends in {status.window!.endsInHours}h
          </div>
        )}
      </div>
    </div>
  );
}

/** The pulsing teal dot. The 4px box-shadow at 0.15 alpha is the spec glow. */
function Dot() {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-champagne flex-shrink-0"
      style={{ boxShadow: "0 0 0 4px rgba(45, 212, 191, 0.15)" }}
      aria-hidden
    />
  );
}

/** The vertical pipe between metadata pills. Hidden on mobile. */
function Divider() {
  return (
    <span
      className="inline-block w-px h-3.5 bg-line-2 flex-shrink-0"
      aria-hidden
    />
  );
}

/** A metadata pill wrapper — small, muted color. */
function Meta({ children }: { children: React.ReactNode }) {
  return <span className="text-meta text-stone-3">{children}</span>;
}
