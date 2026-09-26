"use client";

import dynamic from "next/dynamic";

const FlowField = dynamic(() => import("@/components/visuals/flow-field").then((m) => m.FlowField), { ssr: false });

/** Quiet flow-field backdrop for statement sections. */
export function FlowBand() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-0 opacity-50 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
      <FlowField density={0.5} nodes={false} />
    </div>
  );
}
