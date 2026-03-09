"use client";

import { useState, useEffect, useTransition } from "react";
import { signIn } from "next-auth/react";
import { prepareLinkPlatform } from "@/app/actions/prepare-link";

// ── Disconnect confirmation dialog ─────────────────────────────────────────
function DisconnectDialog({
  platform,
  displayName,
  onConfirm,
  onCancel,
}: {
  platform: string;
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-red-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
        </div>

        {/* Copy */}
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-white">
            Disconnect {displayName}?
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            This will revoke Whistle&apos;s access to your {displayName} account.
            Monitoring will stop immediately. You can reconnect at any time.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

interface TokenStatus {
  platform: string;
  platform_username: string | null;
  status: string;
  updated_at: string | null;
}

interface PollStatus {
  lastPollAt: string | null;
  lastResult: {
    accountsPolled: number;
    contentFetched: number;
    pipelineRunsCreated: number;
    errors: string[];
    durationMs: number;
  } | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PlatformCard({
  platform,
  displayName,
  icon,
  token,
  onConnect,
  onDisconnect,
}: {
  platform: string;
  displayName: string;
  icon: React.ReactNode;
  token: TokenStatus | null;
  onConnect: () => void | Promise<void>;
  onDisconnect: () => void;
}) {
  const connected = token?.status === "active";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{displayName}</p>
          {connected ? (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              @{token?.platform_username ?? "connected"}
            </p>
          ) : (
            <p className="text-xs text-gray-500">Not connected</p>
          )}
        </div>
        {connected ? (
          <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5 font-medium">
            Active
          </span>
        ) : (
          <span className="text-xs bg-gray-800 text-gray-500 rounded-full px-2.5 py-0.5 font-medium">
            Inactive
          </span>
        )}
      </div>

      {connected && token?.updated_at && (
        <p className="text-xs text-gray-600">
          Last updated {timeAgo(token.updated_at)}
        </p>
      )}

      <div className="flex gap-2">
        {connected ? (
          <button
            onClick={onDisconnect}
            className="flex-1 py-2 px-4 rounded-xl text-sm font-medium bg-gray-800 text-gray-300 hover:bg-red-900/40 hover:text-red-400 border border-gray-700 hover:border-red-800 transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="flex-1 py-2 px-4 rounded-xl text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100 transition-colors"
          >
            Connect {displayName}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConnectPage() {
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  const [pollStatus, setPollStatus] = useState<PollStatus>({
    lastPollAt: null,
    lastResult: null,
  });
  const [polling, startPolling] = useTransition();
  const [pollMessage, setPollMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{
    platform: string;
    displayName: string;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  async function loadStatuses() {
    try {
      const [tokRes, pollRes] = await Promise.all([
        fetch("/api/connect/status"),
        fetch("/api/poll/status"),
      ]);
      if (tokRes.ok) setTokens(await tokRes.json());
      if (pollRes.ok) setPollStatus(await pollRes.json());
    } catch {
      // silent — show stale data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatuses();
  }, []);

  function getToken(platform: string): TokenStatus | null {
    return tokens.find((t) => t.platform === platform) ?? null;
  }

  async function handleDisconnect(platform: string) {
    setDisconnecting(true);
    try {
      await fetch("/api/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      await loadStatuses();
    } finally {
      setDisconnecting(false);
      setConfirmDisconnect(null);
    }
  }

  function requestDisconnect(platform: string, displayName: string) {
    setConfirmDisconnect({ platform, displayName });
  }

  async function handleSeedDemo() {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/seed-demo", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const seeded = data.results?.filter((r: { status: string }) => r.status === "seeded").length ?? 0;
        const skipped = data.results?.filter((r: { status: string }) => r.status?.startsWith("skipped")).length ?? 0;
        setSeedMessage(
          seeded > 0
            ? `Seeded ${seeded} demo mention(s) through the AI pipeline. Check the Feed!`
            : skipped > 0
            ? "Demo data already loaded — check the Feed."
            : "Seed completed."
        );
      } else {
        setSeedMessage("Seed failed. Check server logs.");
      }
    } catch {
      setSeedMessage("Seed request failed.");
    } finally {
      setSeeding(false);
    }
  }

  function handlePollNow() {
    startPolling(async () => {
      setPollMessage(null);
      try {
        const res = await fetch("/api/poll", { method: "POST" });
        const data = await res.json();
        if (res.ok) {
          setPollMessage(
            `Polled ${data.accountsPolled} account(s). Fetched ${data.contentFetched} item(s), ran ${data.pipelineRunsCreated} pipeline(s).${
              data.errors?.length ? ` ${data.errors.length} error(s).` : ""
            }`
          );
          await loadStatuses();
        } else {
          setPollMessage("Poll failed. Check server logs.");
        }
      } catch {
        setPollMessage("Poll request failed.");
      }
    });
  }

  const twitterIcon = (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Connected Accounts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your social accounts to start monitoring mentions.
        </p>
      </div>

      {/* Poll Now card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Manual Poll</p>
            <p className="text-xs text-gray-500">
              Last polled: {timeAgo(pollStatus.lastPollAt)}
            </p>
          </div>
          <button
            onClick={handlePollNow}
            disabled={polling}
            className="py-2 px-4 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
          >
            {polling && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
            )}
            {polling ? "Polling…" : "Poll Now"}
          </button>
        </div>

        {pollMessage && (
          <p className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
            {pollMessage}
          </p>
        )}

        {/* Demo seed */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-800">
          <p className="text-xs text-gray-600">No live data? Load demo mentions.</p>
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="py-1.5 px-3 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 transition-colors"
          >
            {seeding ? "Seeding…" : "Load Demo Data"}
          </button>
        </div>
        {seedMessage && (
          <p className="text-xs text-blue-400 bg-blue-950/40 border border-blue-900/40 rounded-lg px-3 py-2">
            {seedMessage}
          </p>
        )}

        {pollStatus.lastResult && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Accounts", value: pollStatus.lastResult.accountsPolled },
              { label: "Fetched", value: pollStatus.lastResult.contentFetched },
              { label: "Processed", value: pollStatus.lastResult.pipelineRunsCreated },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg py-2">
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Platform cards */}
      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 h-32 animate-pulse" />
      ) : (
        <div className="space-y-4">
          <PlatformCard
            platform="twitter"
            displayName="Twitter / X"
            icon={twitterIcon}
            token={getToken("twitter")}
            onConnect={async () => {
              await prepareLinkPlatform();
              signIn("twitter", { callbackUrl: "/connect" });
            }}
            onDisconnect={() => requestDisconnect("twitter", "Twitter / X")}
          />
        </div>
      )}

      {/* Disconnect confirmation */}
      {confirmDisconnect && (
        <DisconnectDialog
          platform={confirmDisconnect.platform}
          displayName={confirmDisconnect.displayName}
          onConfirm={() => handleDisconnect(confirmDisconnect.platform)}
          onCancel={() => setConfirmDisconnect(null)}
        />
      )}

      {/* Disconnecting overlay */}
      {disconnecting && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <svg className="animate-spin w-8 h-8 text-white/70" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      )}
    </div>
  );
}
