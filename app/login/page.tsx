"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || "Sign in failed.");
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
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[#A89A90] hover:text-[#F5EDE2] transition"
        >
          &larr; Back to Overview
        </Link>

        <div className="rounded-3xl border border-[#F0E2CC]/15 bg-[#171215] p-7 shadow-2xl space-y-5">
          <div>
            <span className="inline-flex items-center rounded-full border border-[#E5C17B]/35 bg-[#E5C17B]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#E5C17B]">
              Founding Cohort Member
            </span>
            <h1 className="mt-3 font-serif text-2xl font-semibold text-[#F8F1E7]">
              Sign in to Coastal Dusk
            </h1>
            <p className="mt-1 text-xs text-[#B3A499]">
              Use the email and password you created when reserving your SWFL spot.
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-4 py-3 text-xs text-[#F4C4CB]">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] px-5 text-sm font-semibold text-[#1A1310] transition hover:bg-[#EED093] disabled:opacity-60"
            >
              {loading ? "Signing In..." : "Enter Green Room"}
            </button>
          </form>

          <p className="text-center text-xs text-[#A89A90]">
            Need a spot first?{" "}
            <Link href="/join" className="text-[#E5C17B] underline hover:text-[#F2D7A4]">
              Join Cohort 01
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}