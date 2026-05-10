"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Step = "input" | "verify";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("input");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseBrowser();

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!email.includes("@")) {
        setError("Please enter a valid email address.");
        setLoading(false);
        return;
      }
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });
      if (otpError) throw otpError;

      setStep("verify");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send code. Try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // signInWithOtp uses the magic link flow — verify with "magiclink" type for email.
      // Try magiclink first, fall back to "email" if it fails (covers both Supabase configs).
      let data;
      let verifyError;

      // Try magiclink type first (used when "Confirm email" is OFF)
      const result = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "magiclink",
      });
      data = result.data;
      verifyError = result.error;

      // If magiclink type failed, try email type (used when "Confirm email" is ON)
      if (verifyError) {
        const fallback = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: "email",
        });
        data = fallback.data;
        verifyError = fallback.error;
      }

      if (verifyError) throw verifyError;

      // Get the session — either from the verify response or from the current session
      const session = data?.session ?? (await supabase.auth.getSession()).data.session;

      if (!session) {
        throw new Error("Verification succeeded but no session was created. Please try again.");
      }

      // Set the session cookie FIRST so the server-side middleware recognizes
      // the user. The Supabase browser client stores the session in
      // localStorage, but our middleware/route handlers read from cookies —
      // this endpoint bridges the two.
      //
      // Order matters: ensure-user requires a verified session cookie, so it
      // must run after set-session.
      await fetch("/api/auth/set-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: {
            id: session.user.id,
            email: session.user.email,
            phone: session.user.phone,
          },
        }),
      });

      // Ensure user row exists in our public.users table
      await ensureUserRow(session.user.id, session.user.email ?? null);

      // Redirect to dashboard
      window.location.href = "/";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid code. Try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function ensureUserRow(authId: string, identifier: string | null) {
    try {
      await fetch("/api/auth/ensure-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_id: authId, identifier }),
      });
    } catch {
      // Non-blocking
    }
  }

  function handleBack() {
    setStep("input");
    setOtp("");
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo and branding */}
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-teal-500 flex items-center justify-center mb-4">
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 text-white"
              fill="currentColor"
            >
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">NetRef Safety</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-powered content moderation
          </p>
        </div>

        {/* Login card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {step === "input" ? (
            <>
              <div>
                <h2 className="text-lg font-semibold text-white">Sign in</h2>
                <p className="text-sm text-gray-400 mt-1">
                  We&apos;ll send a verification code to your email.
                </p>
              </div>

              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
                >
                  {loading && (
                    <svg
                      className="animate-spin w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
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
                  {loading ? "Sending code..." : "Send verification code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Check your inbox
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Enter the verification code sent to{" "}
                  <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <label
                    htmlFor="otp"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Verification code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="00000000"
                    autoFocus
                    required
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm text-center tracking-[0.3em] text-lg font-mono"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length < 8}
                  className="w-full py-3 px-4 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
                >
                  {loading && (
                    <svg
                      className="animate-spin w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
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
                  {loading ? "Verifying..." : "Verify & sign in"}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Use a different email
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-600">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
