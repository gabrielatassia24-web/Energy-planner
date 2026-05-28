"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

function CallbackHandler() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token_hash = searchParams.get("token_hash");
    const type       = searchParams.get("type");
    const code       = searchParams.get("code");

    async function run() {
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as "magiclink" | "email",
        });
        if (!error) { router.push("/"); return; }
      }
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { router.push("/"); return; }
      }
      router.push("/login");
    }

    run();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="h-10 w-10 rounded-2xl bg-[#F5CF82] animate-pulse" />
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-10 w-10 rounded-2xl bg-[#F5CF82] animate-pulse" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
