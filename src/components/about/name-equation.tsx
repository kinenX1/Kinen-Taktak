"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { ease } from "@/lib/motion";
import type { Dictionary } from "@/i18n/dictionaries";

/** "Movement + Era" collapses into "MovEra" when scrolled into view. */
export function NameEquation({ t: copy }: { t: Dictionary["about"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -30% 0px" });
  const reduce = useReducedMotion();
  const merged = inView || reduce;
  const t = { duration: 1.2, ease: ease.inOutQuint, delay: 0.6 };

  return (
    <div ref={ref} className="relative">
      <p className="sr-only">{copy.nameSr}</p>
      <div aria-hidden="true" className="flex flex-wrap items-baseline text-[clamp(3.5rem,13vw,13rem)] font-medium leading-[0.9] tracking-[-0.06em]">
        <span className="text-fog-50">Mov</span>
        <motion.span
          className="inline-block overflow-hidden whitespace-nowrap text-fog-500"
          initial={false}
          animate={merged ? { width: 0, opacity: 0 } : { width: "auto", opacity: 1 }}
          transition={t}
        >
          ement
        </motion.span>
        <motion.span
          className="inline-block overflow-hidden whitespace-nowrap px-[0.1em] text-fog-500"
          initial={false}
          animate={merged ? { width: 0, opacity: 0, paddingLeft: 0, paddingRight: 0 } : { width: "auto", opacity: 1 }}
          transition={t}
        >
          +
        </motion.span>
        <span className="accent-serif text-flux">E</span>
        <span className="text-fog-50">ra</span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={merged ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1, ease: ease.outExpo, delay: 1.6 }}
        className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-2"
      >
        <p className="leading-relaxed text-fog-400">
          <span className="text-fog-50">{copy.movement}</span> — {copy.movementBody}
        </p>
        <p className="leading-relaxed text-fog-400">
          <span className="text-fog-50">{copy.era}</span> — {copy.eraBody}
        </p>
      </motion.div>
    </div>
  );
}
