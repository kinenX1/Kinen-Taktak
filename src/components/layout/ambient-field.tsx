"use client";

import dynamic from "next/dynamic";

const FlowField = dynamic(() => import("@/components/visuals/flow-field").then((m) => m.FlowField), { ssr: false });

export function AmbientField() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-60">
      <FlowField density={0.6} />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
    </div>
  );
}
