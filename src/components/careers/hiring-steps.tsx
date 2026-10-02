"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";
import { ease } from "@/lib/motion";

/** Hiring process as a rail that fills while it scrolls past. */
export function HiringSteps({ steps }: { steps: { title: string; body: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });
  const fill = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  return (
    <ol ref={ref} className="relative grid gap-10 md:grid-cols-4 md:gap-6">
      <span aria-hidden="true" className="absolute left-[15px] top-4 h-[calc(100%-2rem)] w-px bg-line-strong md:left-0 md:top-[15px] md:h-px md:w-full">
        <motion.span style={{ scaleY: fill }} className="absolute inset-0 origin-top bg-gradient-to-b from-flux to-ion md:hidden" />
        <motion.span style={{ scaleX: fill }} className="absolute inset-0 hidden origin-left bg-gradient-to-r from-flux to-ion md:block" />
      </span>
      {steps.map((s, i) => (
        <motion.li
          key={s.title}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.9, ease: ease.outExpo, delay: i * 0.1 }}
          className="relative pl-12 md:pl-0 md:pt-12"
        >
          <span className="absolute left-0 top-0 flex size-[31px] items-center justify-center rounded-full border border-flux/60 bg-ink-950 font-mono text-2xs text-flux shadow-[var(--glow-flux)]">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="text-2xl font-medium tracking-[-0.03em] text-fog-50">{s.title}</h3>
          <p className="mt-2 leading-relaxed text-fog-400">{s.body}</p>
        </motion.li>
      ))}
    </ol>
  );
}
