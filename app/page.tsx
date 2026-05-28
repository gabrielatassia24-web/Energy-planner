"use client";

import { useEffect, useState } from "react";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Test 2 - client component</h1>
      <p>Mounted: {mounted ? "yes" : "no"}</p>
      <p><a href="/login">Go to login</a></p>
    </div>
  );
}
