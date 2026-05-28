"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

export default function Page() {
  const router = useRouter();
  const [user,        setUser]        = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Same useState calls as EnergySchedulerMVP
  const [tasks]          = useState<unknown[]>(() => readStorage<unknown[]>("planner-tasks-v3", []));
  const [fixedEvents]    = useState<unknown[]>(() => readStorage<unknown[]>("planner-fixed-events-v2", []));
  const [energyStateValue] = useState<string>(() => {
    if (typeof window === "undefined") return "normal";
    const s = localStorage.getItem("planner-energy-v1");
    return (s === "tired" || s === "normal" || s === "energized") ? s : "normal";
  });
  const [currentHour]    = useState(() => new Date().getHours());
  const [currentMinute]  = useState(() => new Date().getMinutes());
  const [skippedTaskIds] = useState<string[]>(() => readStorage<string[]>("planner-skipped-v1", []));
  const [learningMap]    = useState<Record<string, unknown>>(() => readStorage<Record<string, unknown>>("planner-learning-v1", {}));
  const [taskLog]        = useState<unknown[]>(() => readStorage<unknown[]>("planner-log-v1", []));
  const [lastResetDate]  = useState<string>(() => readStorage<string>("planner-last-reset-v1", ""));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading) return <div style={{ padding: 40 }}>Test 7 - loading...</div>;
  if (!user)       return <div style={{ padding: 40 }}>Test 7 - redirecting...</div>;

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Test 7 - all useState initialized</h1>
      <p>User: {user.email}</p>
      <p>Tasks: {tasks.length}, Events: {fixedEvents.length}, Skipped: {skippedTaskIds.length}, Log: {taskLog.length}</p>
      <p>Hour: {currentHour}, Minute: {currentMinute}, Energy: {energyStateValue}, LastReset: {lastResetDate || "(empty)"}</p>
      <p>LearningMap keys: {Object.keys(learningMap).length}</p>
    </div>
  );
}
