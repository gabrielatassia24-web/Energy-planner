"use client";

import dynamic from "next/dynamic";

const EnergySchedulerMVP = dynamic(() => import("./EnergySchedulerMVP"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#FFF8EE] flex items-center justify-center">
      <div className="h-10 w-10 rounded-2xl bg-[#E8D0B8] animate-pulse" />
    </div>
  ),
});

export default function Page() {
  return <EnergySchedulerMVP />;
}
