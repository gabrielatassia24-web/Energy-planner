"use client";

import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function Page() {
  const [status, setStatus] = useState("checking...");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "logged in: " + data.session.user.email : "not logged in");
    });
  }, []);
  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Test 3 - supabase</h1>
      <p>Session: {status}</p>
      <p><a href="/login">Go to login</a></p>
    </div>
  );
}
