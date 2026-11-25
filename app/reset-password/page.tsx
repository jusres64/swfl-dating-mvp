"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [checkedUrl, setCheckedUrl] = useState(false);

  // Request-link mode (when visiting /reset-password directly)
  const [email, setEmail] = useState("");
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  // Set-new-password mode (when arriving from email link)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
    );
    const searchParams = new URLSearchParams(window.location.search);

    const errDesc =
      hashParams.get("error_description") || searchParams.get("error_description");
    if (errDesc) {
      setErrorMsg(decodeURIComponent(errDesc.replace(/\+/g, " ")));
    }

    const hashToken = hashParams.get("access_token");
    const queryHash = searchParams.get("token_hash");

    if (hashToken) setAccessToken(hashToken);
    if (queryHash) setTokenHash(queryHash);
    setCheckedUrl(true);
  }, []);

  const hasRecoveryToken = Boolean(accessToken || tokenHash);

  const handleRequestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setRequestNotice(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setErrorMsg(data.error || "Could not send reset email.");
        return;
      }
      setRequestNotice(
        data.message || "Reset link sent. Check your inbox and spam folder."
      );
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: accessToken || undefined,
          tokenHash: tokenHash || undefined,
          newPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || "Could not update password.");
        return;
      }
      router.push("/call");
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-[#A89A90] hover:text-[#F5EDE2] transition"
        >
          &larr; Back to Sign In
        </Link>

        <div className="rounded-3xl border border-[#F0E2CC]/15 bg-[#171215] p-7 shadow-2xl space-y-5">
          <div>
            <span className="inline-flex items-center rounded-full border border-[#E5C17B]/35 bg-[#E5C17B]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#E5C17B]">
              Account Recovery
            </span>
            <h1 className="mt-3 font-serif text-2xl font-semibold text-[#F8F1E7]">
              {hasRecoveryToken ? "Choose a new password" : "Reset your password"}
            </h1>
            <p className="mt-1 text-xs text-[#B3A499]">
              {hasRecoveryToken
                ? "Enter a new password below. Once saved, you will be signed straight into the Green Room."
                : "Enter your account email and we will send you a secure password reset link."}
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-4 py-3 text-xs text-[#F4C4CB]">
              {errorMsg}
            </div>
          )}

          {requestNotice && (
            <div className="rounded-xl border border-[#E5C17B]/35 bg-[#251E18] px-4 py-3 text-xs text-[#F0D9AE]">
              {requestNotice}
            </div>
          )}

          {!checkedUrl ? (
            <p className="text-xs text-[#A89A90]">Checking recovery link...</p>
          ) : hasRecoveryToken ? (
            <form onSubmit={handleSaveNewPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                  autoComplete="new-password"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] px-5 text-sm font-semibold text-[#1A1310] transition hover:bg-[#EED093] disabled:opacity-60"
              >
                {loading ? "Saving Password..." : "Save Password & Enter Green Room"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRequestEmail} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] px-5 text-sm font-semibold text-[#1A1310] transition hover:bg-[#EED093] disabled:opacity-60"
              >
                {loading ? "Sending Link..." : "Send Reset Link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}