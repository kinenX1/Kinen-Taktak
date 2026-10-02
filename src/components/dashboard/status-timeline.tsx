"use client";

import type { RequestStatus } from "@prisma/client";
import { motion } from "motion/react";
import { statusFlow } from "@/config/project-brief";
import { useT } from "@/i18n/client";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Check } from "@/components/ui/icons";

/** Horizontal lifecycle tracker (vertical on small screens). The progress line draws itself in. */
export function StatusTimeline({ status }: { status: RequestStatus }) {
  const t = useT();
  const labels = t.options.statuses;
  if (status === "DRAFT" || status === "CANCELLED") {
    const s = labels[status];
    return (
      <div className="rounded-md border border-line bg-ink-900/60 px-5 py-4 text-sm text-fog-400">
        <span className="font-medium text-fog-50">{s.label}.</span> {s.description}
      </div>
    );
  }
  const currentIndex = statusFlow.indexOf(status);
  return (
    <ol className="grid gap-3 sm:grid-cols-6 sm:gap-0" aria-label={t.dashboard.timeline.label}>
      {statusFlow.map((value, i) => {
        const meta = labels[value];
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={value} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-3" aria-current={current ? "step" : undefined}>
            <div className="flex items-center sm:w-full">
              <span
                className={cn(
                  "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-2xs transition-colors",
                  done && "border-flux bg-flux text-ink-950",
                  current && "border-flux bg-ink-950 text-flux shadow-[var(--glow-flux)]",
                  !done && !current && "border-line-strong bg-ink-950 text-fog-500",
                )}
              >
                {done ? <Check size={13} strokeWidth={2.4} /> : current ? <span className="size-2 animate-pulse rounded-full bg-flux" /> : i + 1}
              </span>
              {i < statusFlow.length - 1 && (
                <span aria-hidden="true" className="relative hidden h-px flex-1 bg-line-strong sm:block">
                  {i < currentIndex && (
                    <motion.span
                      className="absolute inset-0 origin-left bg-gradient-to-r from-flux to-flux-soft shadow-[0_0_8px_rgb(255_90_31/0.7)]"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.7, ease: ease.outExpo, delay: 0.15 + i * 0.12 }}
                    />
                  )}
                </span>
              )}
            </div>
            <div className="sm:pr-3">
              <p className={cn("text-sm font-medium", current || done ? "text-fog-50" : "text-fog-500")}>{meta.label}</p>
              {current && <p className="mt-0.5 text-xs leading-snug text-fog-400">{meta.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
