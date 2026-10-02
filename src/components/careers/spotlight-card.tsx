"use client";

import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card whose border and surface light up around the pointer. */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const glow = useMotionTemplate`radial-gradient(22rem circle at ${x}px ${y}px, rgb(255 90 31 / 0.16), transparent 60%)`;
  const edge = useMotionTemplate`radial-gradient(16rem circle at ${x}px ${y}px, rgb(255 138 92 / 0.7), transparent 60%)`;
  return (
    <div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-200);
        y.set(-200);
      }}
      className={cn("group relative overflow-hidden rounded-xl border border-line bg-ink-900/70 p-7", className)}
    >
      <motion.div
        aria-hidden="true"
        style={{
          background: edge,
          padding: 1,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <motion.div aria-hidden="true" style={{ background: glow }} className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative">{children}</div>
    </div>
  );
}
