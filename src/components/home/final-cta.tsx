"use client";

import Link from "next/link";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Magnetic } from "@/components/motion/magnetic";
import { ArrowUpRight } from "@/components/ui/icons";

/** The closing statement of the home page: a spotlight, speed lines and one action. */
export function FinalCta({
  title = ["Have an idea?", "Let's build it."],
  cta = "Start Your Project",
}: {
  title?: [string, string];
  cta?: string;
}) {
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(40rem circle at ${sx}% ${sy}%, rgb(255 90 31 / 0.22), transparent 60%)`;

  return (
    <section
      aria-labelledby="cta-title"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 100);
        my.set(((e.clientY - r.top) / r.height) * 100);
      }}
      className="grain relative isolate overflow-hidden border-t border-line py-28 md:py-44"
    >
      <motion.div aria-hidden="true" style={{ background: spotlight }} className="absolute inset-0 -z-10" />
      {/* Speed lines — movement */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 h-px w-[200%] animate-marquee"
            style={{
              top: `${12 + i * 13}%`,
              ["--marquee-duration" as string]: `${14 + i * 5}s`,
              background: `repeating-linear-gradient(90deg, transparent 0 ${120 + i * 40}px, rgb(244 242 236 / ${0.05 + (i % 3) * 0.04}) ${120 + i * 40}px ${260 + i * 50}px)`,
            }}
          />
        ))}
      </div>

      <div className="container-x">
        <div className="flex flex-col items-start gap-14 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="cta-title" className="text-display-2xl font-medium">
            <SplitReveal lines={[title[0], { text: title[1], className: "accent-serif text-flux" }]} stagger={0.09} />
          </h2>

          <Magnetic strength={0.35}>
            <Link
              href="/start-project"
              className="group relative flex size-44 shrink-0 items-center justify-center rounded-full bg-flux text-ink-950 transition-[transform,box-shadow] duration-700 ease-(--ease-out-expo) hover:scale-105 hover:shadow-[0_0_120px_-10px_rgb(255_90_31/0.7)] md:size-56"
            >
              <span className="sr-only">{cta}</span>
              <svg viewBox="0 0 200 200" aria-hidden="true" className="absolute inset-0 size-full animate-spin-slow">
                <defs>
                  <path id="cta-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
                </defs>
                <text className="fill-current font-mono text-[12.5px] uppercase tracking-[0.32em]">
                  <textPath href="#cta-circle">{`${cta} • ${cta} • `}</textPath>
                </text>
              </svg>
              <ArrowUpRight size={40} className="transition-transform duration-700 ease-(--ease-out-expo) group-hover:rotate-45" />
            </Link>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
