"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ease } from "@/lib/motion";
import { WordmarkLink } from "@/components/layout/wordmark";

const FlowField = dynamic(() => import("@/components/visuals/flow-field").then((m) => m.FlowField), { ssr: false });

/** Left-hand brand panel for the authentication screens (desktop). */
export function AuthVisual() {
  return (
    <aside className="grain relative hidden overflow-hidden border-r border-line bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div aria-hidden="true" className="absolute inset-0">
        <FlowField density={0.7} />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-ink-900/70" />
      <WordmarkLink className="relative" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: ease.outExpo, delay: 0.2 }}
        className="relative max-w-lg"
      >
        <p className="eyebrow mb-6">Client portal</p>
        <p className="text-display-md font-medium">
          Every project, <span className="accent-serif text-flux">in motion.</span>
        </p>
        <p className="mt-5 leading-relaxed text-fog-400">
          Send project briefs, follow their progress and keep every update in one place.
        </p>
      </motion.div>
    </aside>
  );
}
