"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, { title: string; detail: string }> = {
  Configuration: {
    title: "Server configuration error",
    detail:
      "There's a problem with the server's OAuth configuration. Check that all environment variables (client ID, secret, NEXTAUTH_URL) are set correctly.",
  },
  AccessDenied: {
    title: "Access denied",
    detail:
      "You declined to grant the requested permissions. Try connecting again and approve all requested permissions.",
  },
  Verification: {
    title: "Verification failed",
    detail:
      "The sign-in link is no longer valid. It may have expired or already been used. Return to the connect page and try again.",
  },
  OAuthSignin: {
    title: "OAuth sign-in failed",
    detail:
      "Couldn't start the OAuth flow. This usually means the app's client ID or redirect URI isn't configured correctly in the platform's developer console.",
  },
  OAuthCallback: {
    title: "OAuth callback error",
    detail:
      "The platform returned an error during the callback. This can happen if the app isn't approved, is in sandbox mode with an unregistered test account, or the redirect URI doesn't match.",
  },
  OAuthCreateAccount: {
    title: "Account creation failed",
    detail:
      "Could not save your account after connecting. Check the server logs and verify the Supabase tables are set up correctly.",
  },
  Callback: {
    title: "Callback error",
    detail:
      "An error occurred while processing the sign-in callback. Check the server logs for details.",
  },
  OAuthAccountNotLinked: {
    title: "Account already linked",
    detail:
      "This platform account is already connected to a different user. Sign in with the original account first.",
  },
  Default: {
    title: "Authentication error",
    detail:
      "Something went wrong during sign-in. Try again or check the server logs.",
  },
};

function ErrorContent() {
  const params = useSearchParams();
  const errorCode = params.get("error") ?? "Default";
  const { title, detail } =
    ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES["Default"];

  return (
    <div className="max-w-lg mx-auto px-4 py-16 flex flex-col gap-6">
      {/* Icon */}
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          className="w-6 h-6 text-red-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      {/* Message */}
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <p className="text-sm text-gray-400 leading-relaxed">{detail}</p>
      </div>

      {/* Error code chip */}
      <div className="inline-flex">
        <span className="text-xs font-mono bg-gray-800 border border-gray-700 text-gray-500 rounded-md px-2.5 py-1">
          error: {errorCode}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/connect"
          className="flex-1 text-center py-2.5 px-4 rounded-xl text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100 transition-colors"
        >
          Back to Connect
        </Link>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
