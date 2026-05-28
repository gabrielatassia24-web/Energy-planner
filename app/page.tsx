"use client";

import { useEffect, useState } from "react";
import EnergySchedulerMVP from "./EnergySchedulerMVP";

export default function Page() {
  const [show, setShow] = useState(false);
  useEffect(() => { /* import happened */ }, []);

  if (!show) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Test 5 - importing EnergySchedulerMVP</h1>
        <p>Import done, not rendering the component.</p>
        <button onClick={() => setShow(true)}>Render component</button>
      </div>
    );
  }

  return <EnergySchedulerMVP />;
}
