"use client";

import { motion, useScroll, useSpring } from "motion/react";

/** A thin leopard-amber bar across the top that fills as you scroll. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.3 });
  return <motion.div aria-hidden="true" style={{ scaleX }} className="fixed inset-x-0 top-0 z-[70] h-1 origin-left bg-leopard" />;
}
