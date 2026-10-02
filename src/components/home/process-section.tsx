"use client";

import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { ease } from "@/lib/motion";
import { fmt } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/ui/section-label";
import { SplitReveal } from "@/components/motion/split-reveal";

/**
 * Scroll-driven process. On large screens the left column stays pinned and
 * morphs between step numbers while a progress rail fills; on small screens
 * it becomes a vertical timeline with the same rail.
 */
export function ProcessSection({ labelIndex = "03" }: { labelIndex?: string }) {
  const dict = useT();
  const t = dict.home.process;
  const processSteps = dict.company.processSteps;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.6", "end 0.6"] });
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 26 });
  const [active, setActive] = useState(0);
  const railHeight = useTransform(progress, [0, 1], ["0%", "100%"]);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.min(processSteps.length - 1, Math.max(0, Math.floor(v * processSteps.length)));
    setActive(i);
  });

  const step = processSteps[active]!;

  return (
    <section aria-labelledby="process-title" className="relative border-t border-line bg-ink-900/50 py-24 md:py-36">
      <div className="container-x">
        <SectionLabel index={labelIndex} className="mb-6">
          {t.label}
        </SectionLabel>
        <h2 id="process-title" className="max-w-4xl text-display-lg font-medium">
          <SplitReveal lines={[t.title1, { text: t.title2, className: "accent-serif text-flux" }]} />
        </h2>

        <div ref={ref} className="mt-16 grid gap-12 md:mt-24 lg:grid-cols-12">
          {/* Pinned indicator */}
          <div className="hidden lg:col-span-5 lg:block">
            <div className="sticky top-32">
              <div className="relative flex h-[22rem] items-center overflow-hidden" aria-hidden="true">
                <motion.span
                  key={step.number}
                  initial={{ y: "60%", opacity: 0, filter: "blur(10px)" }}
                  animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, ease: ease.outExpo }}
                  className="block text-[16rem] font-medium leading-none tracking-[-0.08em] text-fog-50"
                >
                  {step.number}
                </motion.span>
                <span className="absolute bottom-6 left-2 text-display-md font-medium text-flux">
                  <motion.span
                    key={step.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, ease: ease.outExpo }}
                    className="inline-block"
                  >
                    {step.title}
                  </motion.span>
                </span>
              </div>
              <div className="mt-6 flex gap-1.5" aria-hidden="true">
                {processSteps.map((s, i) => (
                  <span
                    key={s.number}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors duration-500",
                      i <= active ? "bg-flux" : "bg-line-strong",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          <ol className="relative lg:col-span-7">
            <span aria-hidden="true" className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px bg-line-strong md:left-[9px]">
              <motion.span style={{ height: railHeight }} className="absolute inset-x-0 top-0 block bg-flux" />
            </span>
            {processSteps.map((s, i) => (
              <li key={s.number} className="relative pb-16 pl-10 last:pb-0 md:pb-24 md:pl-14">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-1.5 size-[15px] rounded-full border-2 transition-all duration-500 md:size-[19px]",
                    i <= active ? "border-flux bg-flux shadow-[var(--glow-flux)]" : "border-line-strong bg-ink-900",
                  )}
                />
                <p className="font-mono text-xs text-fog-500">
                  {s.number} — {s.title.toUpperCase()}
                </p>
                <h3
                  className={cn(
                    "mt-3 text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-tight tracking-[-0.035em] transition-colors duration-500",
                    i <= active ? "text-fog-50" : "text-fog-400",
                  )}
                >
                  {s.summary}
                </h3>
                <p className="mt-4 max-w-xl leading-relaxed text-fog-400">{s.detail}</p>
                <ul className="mt-5 flex flex-wrap gap-2" aria-label={fmt(t.outputs, { step: s.title })}>
                  {s.outputs.map((o) => (
                    <li key={o} className="rounded-full border border-line px-3 py-1 text-xs text-fog-200">
                      {o}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
