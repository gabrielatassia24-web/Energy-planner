"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // After clicking the magic link, redirect back to the app
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#F5CF82] mb-4">
            <span className="text-2xl">🧠</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#3D2B1F]">Day Planner</h1>
          <p className="mt-1 text-sm text-[#7A6050]">Sign in to sync your tasks across devices</p>
        </div>

        {sent ? (
          <div className="rounded-3xl border border-[#F5CF82] bg-[#FFFBF0] p-6 text-center">
            <div className="text-2xl mb-3">📬</div>
            <h2 className="text-base font-semibold text-[#3D2B1F] mb-1">Check your email</h2>
            <p className="text-sm text-[#7A6050]">
              We sent a magic link to <strong>{email}</strong>. Click it to sign in — no password needed.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-4 text-sm text-[#82A8F5] underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#7A6050]">
                Email address
              </label>
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

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full min-h-[48px] rounded-2xl bg-[#F5CF82] text-base font-medium text-[#3D2B1F] hover:bg-[#E8BB60] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>

            <p className="text-center text-xs text-[#B8CCFA]">
              No password required. We&apos;ll email you a one-click sign-in link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}