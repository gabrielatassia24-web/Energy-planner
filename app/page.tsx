"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";
import { Brain, CalendarDays, CheckCircle2, History, Zap, Trash2, PlayCircle, Sparkles, Sun, Moon, Clock, ChevronDown, ChevronUp, TrendingUp, LogOut, Timer } from "lucide-react";

export default function Page() {
  const router = useRouter();
  const [user,        setUser]        = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [items] = useState(() => Array.from({ length: 50 }, (_, i) => ({ id: i, label: `Item ${i}` })));
  const sorted = useMemo(() => [...items].sort((a, b) => b.id - a.id), [items]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading) return <div style={{ padding: 40 }}>Test 8 - loading...</div>;
  if (!user)       return <div style={{ padding: 40 }}>Test 8 - redirecting...</div>;

  return (
    <div className="min-h-screen bg-[#FDF6EE] p-6">
      <h1 className="text-2xl font-semibold mb-4">Test 8 - heavy UI with icons</h1>
      <div className="flex gap-3 mb-4 flex-wrap">
        <Brain /><CalendarDays /><CheckCircle2 /><History /><Zap />
        <Trash2 /><PlayCircle /><Sparkles /><Sun /><Moon />
        <Clock /><ChevronDown /><ChevronUp /><TrendingUp /><LogOut /><Timer />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sorted.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[#E8D0B8] bg-white p-4">
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
