"use client";

import dynamic from "next/dynamic";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { ease } from "@/lib/motion";
import { ButtonLink } from "@/components/ui/button";
import { Magnetic } from "@/components/motion/magnetic";
import { SplitReveal } from "@/components/motion/split-reveal";
import { HeroFragments } from "./hero-fragments";

// The canvas is purely decorative — load it after the critical content.
const FlowField = dynamic(() => import("@/components/visuals/flow-field").then((m) => m.FlowField), {
  ssr: false,
});

const disciplines = ["Websites", "Apps", "Software", "Digital products"];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const contentY = useTransform(progress, [0, 1], reduce ? [0, 0] : [0, -140]);
  const contentOpacity = useTransform(progress, [0, 0.75], [1, 0]);
  const fieldScale = useTransform(progress, [0, 1], reduce ? [1, 1] : [1, 1.15]);

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden pt-(--nav-height)"
    >
      {/* Background: flow field + lighting */}
      <motion.div style={{ scale: fieldScale }} className="absolute inset-0 -z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.4, ease: "easeOut", delay: 0.2 }}
          className="absolute inset-0"
        >
          <FlowField />
        </motion.div>
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,transparent,rgb(6_7_9/0.7)_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950 via-ink-950/80 to-transparent" />
        <div className="absolute -right-[10%] -top-[20%] size-[60vw] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.14),transparent_60%)] blur-2xl" />
      </motion.div>

      <HeroFragments progress={progress} />

      <motion.div style={{ y: contentY, opacity: contentOpacity }} className="container-x flex flex-1 flex-col justify-end pb-10 pt-16 md:pb-14">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: ease.outExpo, delay: 0.2 }}
          className="eyebrow mb-8 flex items-center gap-3"
        >
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-pulse-dot rounded-full bg-flux" />
            <span className="relative size-2 rounded-full bg-flux" />
          </span>
          Digital product studio
        </motion.p>

        <h1 id="hero-title" className="max-w-[15ch] text-display-xl font-medium text-fog-50">
          <SplitReveal
            immediate
            delay={0.25}
            stagger={0.07}
            lines={[
              "We build digital",
              "experiences that",
              <span key="move">
                <span className="accent-serif text-flux">move</span> businesses
              </span>,
              <span key="fwd" className="inline-flex items-center gap-[0.18em]">
                forward
                <motion.span
                  aria-hidden="true"
                  initial={{ x: "-0.4em", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 1.4, ease: ease.outExpo, delay: 1.2 }}
                  className="inline-block text-[0.7em] text-flux"
                >
                  →
                </motion.span>
              </span>,
            ]}
          />
        </h1>

        <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-12 md:items-end">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: ease.outExpo, delay: 0.9 }}
            className="md:col-span-6 lg:col-span-5"
          >
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-lead font-medium text-fog-50">
              {disciplines.map((d, i) => (
                <motion.span
                  key={d}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, ease: ease.outExpo, delay: 1 + i * 0.1 }}
                >
                  {d}.
                </motion.span>
              ))}
            </p>
            <p className="mt-4 max-w-md leading-relaxed text-fog-400">
              MovEra designs and engineers custom websites, applications and software — built with care,
              launched with confidence and made to keep evolving with your business.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: ease.outExpo, delay: 1.1 }}
            className="flex flex-wrap items-center gap-3 md:col-span-6 md:justify-end lg:col-span-7"
          >
            <Magnetic>
              <ButtonLink href="/start-project" size="lg" arrow>
                Start a Project
              </ButtonLink>
            </Magnetic>
            <Magnetic>
              <ButtonLink href="/work" size="lg" variant="secondary">
                Explore Our Work
              </ButtonLink>
            </Magnetic>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 1.6 }}
          className="mt-14 hidden items-center justify-between border-t border-line pt-5 md:flex"
          aria-hidden="true"
        >
          <span className="eyebrow">Design · Technology · Strategy · Engineering</span>
          <span className="eyebrow flex items-center gap-3">
            Scroll
            <span className="relative h-8 w-px overflow-hidden bg-line-strong">
              <motion.span
                className="absolute inset-x-0 top-0 h-1/2 bg-flux"
                animate={{ y: ["-100%", "200%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: ease.inOutQuint }}
              />
            </span>
          </span>
        </motion.div>
      </motion.div>
    </section>
  );
}
