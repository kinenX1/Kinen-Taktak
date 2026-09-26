"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useState, type ReactNode } from "react";

/**
 * Wraps a project cover: follows the pointer with a "View" disc on hover.
 * The cover is a duplicate of the title link, so it is hidden from the
 * accessibility tree and keyboard focus order.
 */
export function ProjectCoverLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 30, mass: 0.5 });
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 30, mass: 0.5 });

  return (
    <Link
      href={href}
      tabIndex={-1}
      aria-hidden="true"
      className={`relative block cursor-none overflow-hidden ${className ?? ""}`}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.jump(e.clientX - r.left);
        y.jump(e.clientY - r.top);
        setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
    >
      {children}
      {!reduce && (
        <motion.span
          style={{ x, y }}
          animate={{ scale: hover ? 1 : 0, opacity: hover ? 1 : 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute left-0 top-0 z-10 -ml-12 -mt-12 flex size-24 items-center justify-center rounded-full bg-fog-50 text-sm font-medium text-ink-950"
        >
          View
        </motion.span>
      )}
    </Link>
  );
}
