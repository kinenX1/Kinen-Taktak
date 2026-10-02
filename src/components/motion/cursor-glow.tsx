"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useState } from "react";

/**
 * A soft light that follows the pointer across the site, plus a trailing
 * ring that grows over links and buttons. Fine pointers only; disabled for
 * reduced motion. Purely decorative.
 */
export function CursorGlow() {
  const reduce = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [hot, setHot] = useState(false);
  const [down, setDown] = useState(false);
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const gx = useSpring(x, { stiffness: 60, damping: 20, mass: 0.6 });
  const gy = useSpring(y, { stiffness: 60, damping: 20, mass: 0.6 });
  const rx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.3 });
  const ry = useSpring(y, { stiffness: 500, damping: 40, mass: 0.3 });

  useEffect(() => {
    if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- enable only after checking the device
    setEnabled(true);
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as Element | null;
      setHot(!!target?.closest("a, button, [role='button'], input, textarea, select, label"));
    };
    const press = () => setDown(true);
    const release = () => setDown(false);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
    };
  }, [reduce, x, y]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      <motion.div
        style={{ x: gx, y: gy }}
        className="absolute -left-[22rem] -top-[22rem] size-[44rem] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.07),rgb(139_156_255/0.035)_35%,transparent_65%)] mix-blend-screen"
      />
      <motion.div
        style={{ x: rx, y: ry }}
        animate={{ scale: down ? 0.7 : hot ? 1.9 : 1, opacity: hot ? 1 : 0.55 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className="absolute -left-4 -top-4 size-8 rounded-full border border-fog-50/40 mix-blend-difference"
      />
    </div>
  );
}
