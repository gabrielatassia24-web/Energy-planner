"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";
import {
  fetchTasks, fetchFixedEvents, fetchTaskLog, fetchLearningMap, fetchPreferences,
} from "./lib/db";

export default function Page() {
  const router = useRouter();
  const [user,        setUser]        = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading) return <div style={{ padding: 40 }}>Test 6 - loading...</div>;
  if (!user)       return <div style={{ padding: 40 }}>Test 6 - redirecting...</div>;

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Test 6 - logged in</h1>
      <p>Email: {user.email}</p>
      <p>Imports: db.ts loaded ({typeof fetchTasks}, {typeof fetchFixedEvents}, {typeof fetchTaskLog}, {typeof fetchLearningMap}, {typeof fetchPreferences})</p>
    </div>
  );
}
