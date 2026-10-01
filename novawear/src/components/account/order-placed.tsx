"use client";

import { motion } from "motion/react";
import { ease } from "@/lib/motion";
import { Runner } from "@/components/brand/motion-marks";

/** The celebration banner shown right after checkout. */
export function OrderPlaced({ reference, preorder }: { reference: string; preorder: boolean }) {
  return (
    <section role="status" className="relative mb-10 overflow-hidden bg-ink px-6 pb-24 pt-10 text-center text-bone sm:px-10">
      <div aria-hidden="true" className="print absolute inset-0 animate-drift opacity-[0.08] [--print-ink:var(--color-leopard)]" />
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="relative mx-auto flex size-24 items-center justify-center rounded-full bg-leopard"
      >
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.6 }} />
        </svg>
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8, ease: ease.outExpo }}
        className="display relative mt-6 text-[clamp(3.5rem,9vw,8rem)]"
      >
        Welcome to the pack
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.8, ease: ease.outExpo }}
        className="relative mx-auto mt-4 max-w-lg text-lg leading-relaxed text-fog"
      >
        Order <strong className="text-bone">{reference}</strong> is in. {preorder ? "Your pre-order pieces are reserved in your size. " : ""}We&apos;ll call or message you to confirm.
      </motion.p>
      <div className="absolute inset-x-0 bottom-0 h-20 border-t border-line-dark">
        <Runner className="bottom-1 w-32" duration={6} knockout="var(--color-ink)" />
      </div>
    </section>
  );
}
