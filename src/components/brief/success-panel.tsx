"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { siteConfig } from "@/config/site";
import { ease } from "@/lib/motion";
import { ButtonLink } from "@/components/ui/button";

export function SuccessPanel({ reference, name }: { reference: string; name?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: ease.outExpo }}
      className="grain relative overflow-hidden rounded-xl border border-line bg-ink-900 px-6 py-16 text-center md:px-16 md:py-24"
      role="status"
      aria-live="polite"
    >
      <div aria-hidden="true" className="absolute inset-x-0 -top-1/2 mx-auto size-[48rem] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.18),transparent_60%)]" />
      <svg viewBox="0 0 80 80" className="relative mx-auto size-20" aria-hidden="true">
        <motion.circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="var(--color-flux)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: ease.outExpo }}
        />
        <motion.path
          d="M25 41 l10 10 20-22"
          fill="none"
          stroke="var(--color-fog-50)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: ease.outExpo, delay: 0.7 }}
        />
      </svg>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: ease.outExpo, delay: 0.5 }} className="relative">
        <p className="eyebrow mt-10">{name ? `Thank you, ${name.split(" ")[0]}` : "Thank you"}</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-display-md font-medium">
          We&apos;ve received your <span className="accent-serif text-flux">project idea.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg leading-relaxed text-fog-400">
          Our team will review it and contact you soon.
          {siteConfig.responseTimePromise ? ` ${siteConfig.responseTimePromise}` : ""} You can follow its status in your
          client portal at any time.
        </p>
        <div className="mx-auto mt-10 inline-flex items-center gap-4 rounded-full border border-line bg-ink-950 py-2 pl-6 pr-2">
          <span className="eyebrow">Reference</span>
          <span className="font-mono text-lg tracking-[0.08em] text-fog-50">{reference}</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(reference).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="h-9 rounded-full bg-fog-50/[0.06] px-4 text-xs text-fog-200 transition-colors hover:bg-fog-50/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/dashboard/requests/${reference}`} arrow>
            View in dashboard
          </ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Back to home
          </ButtonLink>
        </div>
      </motion.div>
    </motion.div>
  );
}
