"use client";

import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { Brain, CalendarDays, CheckCircle2, History, Zap } from "lucide-react";

export default function Page() {
  const [status, setStatus] = useState("checking...");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "logged in" : "not logged in");
    });
  }, []);
  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Test 4 - lucide-react icons</h1>
      <p>Session: {status}</p>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Brain />
        <CalendarDays />
        <CheckCircle2 />
        <History />
        <Zap />
      </div>
      <p><a href="/login">Go to login</a></p>
    </div>
  );
}
