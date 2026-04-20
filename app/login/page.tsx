"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const [email,   setEmail]   = useState("");
  const [token,   setToken]   = useState("");
  const [step,    setStep]    = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("code");
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    }
    // if success, onAuthStateChange in the main app detects the session automatically
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#F5CF82] mb-4">
            <span className="text-2xl">🧠</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#3D2B1F]">Day Planner</h1>
          <p className="mt-1 text-sm text-[#7A6050]">Sign in to sync your tasks across devices</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoCapitalize="none"
                className="w-full rounded-2xl border border-[#F5CF82] bg-white px-4 py-3 text-base text-[#3D2B1F] outline-none transition focus:border-[#82A8F5]"
                required
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading || !email.trim()}
              className="w-full min-h-[48px] rounded-2xl bg-[#F5CF82] text-base font-medium text-[#3D2B1F] hover:bg-[#E8BB60] disabled:opacity-40 disabled:cursor-not-allowed transition">
              {loading ? "Sending…" : "Send 6-digit code"}
            </button>

            <p className="text-center text-xs text-[#B8CCFA]">
              We&apos;ll email you a 6-digit code — no password needed.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="rounded-3xl border border-[#F5CF82] bg-[#FFFBF0] p-4 text-center">
              <p className="text-sm text-[#7A6050]">We sent a 6-digit code to</p>
              <p className="font-semibold text-[#3D2B1F] mt-0.5">{email}</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">Enter your code</label>
              <input
                type="text"
                inputMode="numeric"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full rounded-2xl border border-[#F5CF82] bg-white px-4 py-3 text-2xl text-center font-semibold text-[#3D2B1F] tracking-widest outline-none transition focus:border-[#82A8F5]"
                required
              />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading || token.length !== 6}
              className="w-full min-h-[48px] rounded-2xl bg-[#F5CF82] text-base font-medium text-[#3D2B1F] hover:bg-[#E8BB60] disabled:opacity-40 disabled:cursor-not-allowed transition">
              {loading ? "Verifying…" : "Sign in"}
            </button>

            <button type="button" onClick={() => { setStep("email"); setToken(""); setError(null); }}
              className="w-full text-sm text-[#82A8F5] underline">
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}