"use client";

import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ease } from "@/lib/motion";
import { WordmarkLink } from "@/components/layout/wordmark";
import { useT } from "@/i18n/client";

const FlowField = dynamic(() => import("@/components/visuals/flow-field").then((m) => m.FlowField), { ssr: false });

/** Left-hand brand panel for the authentication screens (desktop). */
export function AuthVisual() {
  const t = useT().auth;
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
        <p className="eyebrow mb-6">{t.clientPortal}</p>
        <p className="text-display-md font-medium">
          {t.visualTitle1} <span className="accent-serif text-flux">{t.visualTitle2}</span>
        </p>
        <p className="mt-5 leading-relaxed text-fog-400">{t.visualBody}</p>
      </motion.div>
    </aside>
  );
}
