"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";
import { ease } from "@/lib/motion";
import { useT } from "@/i18n/client";

/**
 * Floating interface fragments orbiting the hero — pieces of the products
 * MovEra builds (a deploy log, a line of code, a live metric, a component).
 * Decorative only; hidden from assistive technology.
 */
export function HeroFragments({ progress }: { progress: MotionValue<number> }) {
  const t = useT().home.hero;
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 20 });
  const sy = useSpring(my, { stiffness: 50, damping: 20 });

  useEffect(() => {
    if (reduce || window.matchMedia("(pointer: coarse)").matches) return;
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, reduce]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-[5] hidden lg:block">
      <Fragment depth={40} sx={sx} sy={sy} progress={progress} scroll={-220} delay={1.4} className="right-[6%] top-[20%]">
        <div className="glass w-64 rounded-lg p-4 font-mono text-[11px] leading-relaxed shadow-[var(--shadow-float)]">
          <div className="mb-3 flex items-center justify-between text-fog-500">
            <span>{t.fragmentDeploy}</span>
            <span className="flex items-center gap-1.5 text-success">
              <span className="size-1.5 rounded-full bg-success" /> {t.fragmentLive}
            </span>
          </div>
          <p className="text-fog-400">
            <span className="text-ion">✓</span> {t.fragmentBuild}
          </p>
          <p className="text-fog-400">
            <span className="text-ion">✓</span> {t.fragmentTests}
          </p>
          <p className="text-fog-400">
            <span className="text-ion">✓</span> {t.fragmentA11y}
          </p>
          <p className="text-fog-50">
            <span className="text-flux">→</span> {t.fragmentReleased}
          </p>
        </div>
      </Fragment>

      <Fragment depth={-30} sx={sx} sy={sy} progress={progress} scroll={-120} delay={1.6} className="right-[30%] top-[13%] hidden xl:block">
        <div className="glass rounded-lg px-4 py-3 font-mono text-[12px] shadow-[var(--shadow-float)]">
          <span className="text-ion">const</span> <span className="text-fog-50">next</span>{" "}
          <span className="text-fog-500">=</span> <span className="text-ion">await</span>{" "}
          <span className="text-flux">move</span>
          <span className="text-fog-400">(business)</span>
        </div>
      </Fragment>

      <Fragment depth={60} sx={sx} sy={sy} progress={progress} scroll={-300} delay={1.8} className="right-[7%] top-[50%]">
        <div className="glass w-56 rounded-lg p-4 shadow-[var(--shadow-float)]">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fog-500">{t.fragmentMomentum}</span>
            <span className="font-mono text-[10px] text-flux">↗</span>
          </div>
          <div className="mt-4 flex h-14 items-end gap-1.5">
            {[28, 36, 30, 48, 44, 62, 58, 80, 74, 96].map((h, i) => (
              <motion.span
                key={i}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 1, ease: ease.outExpo, delay: 2 + i * 0.05 }}
                className="flex-1 origin-bottom rounded-sm"
                style={{ height: `${h}%`, background: i > 6 ? "var(--color-flux)" : "rgb(244 242 236 / 0.18)" }}
              />
            ))}
          </div>
        </div>
      </Fragment>

      <Fragment depth={-50} sx={sx} sy={sy} progress={progress} scroll={-160} delay={2} className="right-[25%] top-[34%] hidden xl:block">
        <div className="glass flex items-center gap-3 rounded-full py-2 pl-2 pr-4 shadow-[var(--shadow-float)]">
          <span className="flex size-7 items-center justify-center rounded-full bg-flux text-[12px] font-semibold text-ink-950">M</span>
          <span className="text-[12px] text-fog-200">{t.fragmentShipped}</span>
        </div>
      </Fragment>
    </div>
  );
}

function Fragment({
  children,
  className,
  depth,
  sx,
  sy,
  progress,
  scroll,
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  depth: number;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  progress: MotionValue<number>;
  scroll: number;
  delay: number;
}) {
  const x = useTransform(sx, (v) => v * depth);
  const pointerY = useTransform(sy, (v) => v * depth);
  const scrollY = useTransform(progress, [0, 1], [0, scroll]);
  const y = useTransform(() => pointerY.get() + scrollY.get());
  return (
    <motion.div style={{ x, y }} className={`absolute ${className ?? ""}`}>
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1.4, ease: ease.outExpo, delay }}
      >
        <div className="animate-float" style={{ animationDelay: `${delay}s` }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
