"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { ease } from "@/lib/motion";
import { fmt } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { ButtonLink } from "@/components/ui/button";
import { Magnetic } from "@/components/motion/magnetic";
import { SplitReveal } from "@/components/motion/split-reveal";

/**
 * Careers opening: a statement on the left and an "orbit" of open roles on
 * the right — rings turn slowly and tilt toward the pointer.
 */
export function CareersHero({ roles, count }: { roles: string[]; count: number }) {
  const t = useT().careers;
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, (v) => v * -14), { stiffness: 60, damping: 18 });
  const ry = useSpring(useTransform(mx, (v) => v * 18), { stiffness: 60, damping: 18 });

  useEffect(() => {
    if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, reduce]);

  const chips = roles.slice(0, 6);

  return (
    <section className="grain relative isolate overflow-hidden pt-[calc(var(--nav-height)+3rem)] pb-20 md:pt-[calc(var(--nav-height)+5rem)] md:pb-28">
      <div aria-hidden="true" className="grid-lines absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(70%_70%_at_70%_40%,black,transparent)]" />
      <div aria-hidden="true" className="absolute -right-[15%] top-0 -z-10 size-[60vw] rounded-full bg-[radial-gradient(circle,rgb(139_156_255/0.12),transparent_60%)]" />
      <div aria-hidden="true" className="absolute -left-[10%] bottom-0 -z-10 size-[45vw] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.12),transparent_60%)]" />

      <div className="container-x grid items-center gap-16 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: ease.outExpo, delay: 0.1 }} className="eyebrow mb-8 flex items-center gap-3">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-pulse-dot rounded-full bg-success" />
              <span className="relative size-2 rounded-full bg-success" />
            </span>
            {t.label} · {fmt(t.openRolesCount, { count })}
          </motion.p>
          <h1 className="text-display-xl font-medium">
            <SplitReveal immediate delay={0.15} lines={[t.title1, { text: t.title2, className: "accent-serif text-flux" }, t.title3]} />
          </h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: ease.outExpo, delay: 0.7 }} className="mt-8 max-w-xl text-lead text-fog-400">
            {t.intro}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: ease.outExpo, delay: 0.9 }} className="mt-10 flex flex-wrap gap-3">
            <Magnetic>
              <ButtonLink href="#roles" size="lg" arrow>
                {t.seeRoles}
              </ButtonLink>
            </Magnetic>
            <Magnetic>
              <ButtonLink href="/careers/apply?role=spontaneous" size="lg" variant="secondary">
                {t.spontaneous}
              </ButtonLink>
            </Magnetic>
          </motion.div>
        </div>

        <div aria-hidden="true" className="relative hidden aspect-square lg:col-span-5 lg:block" style={{ perspective: 1200 }}>
          <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="absolute inset-0">
            {[0.98, 0.74, 0.5].map((scale, i) => (
              <div
                key={scale}
                className="absolute inset-0 m-auto rounded-full border border-line-strong"
                style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, transform: `translateZ(${i * 40}px)` }}
              >
                <div className="absolute inset-0 animate-spin-slow rounded-full" style={{ animationDuration: `${28 + i * 14}s`, animationDirection: i % 2 ? "reverse" : "normal" }}>
                  <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-flux shadow-[0_0_14px_3px_rgb(255_90_31/0.7)]" />
                  {i === 1 && <span className="absolute -bottom-1 left-1/3 size-1.5 rounded-full bg-ion shadow-[0_0_12px_2px_rgb(139_156_255/0.7)]" />}
                </div>
              </div>
            ))}
            <div className="absolute inset-0 m-auto flex size-[30%] flex-col items-center justify-center rounded-full border border-flux/40 bg-ink-900/80 text-center shadow-[0_0_80px_-10px_rgb(255_90_31/0.5)] backdrop-blur" style={{ transform: "translateZ(120px)" }}>
              <span className="text-5xl font-medium tracking-[-0.05em] text-fog-50">{count}</span>
              <span className="eyebrow mt-1 text-[0.5625rem]">{t.openRoles}</span>
            </div>
            {chips.map((role, i) => {
              const angle = (i / chips.length) * Math.PI * 2 - Math.PI / 2;
              const r = 40;
              return (
                <motion.span
                  key={role}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.9, ease: ease.outExpo, delay: 1 + i * 0.12 }}
                  className="glass absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs text-fog-200 shadow-[var(--shadow-float)]"
                  style={{ left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r}%`, transform: `translateZ(${60 + (i % 3) * 30}px)` }}
                >
                  <span className="animate-float inline-block" style={{ animationDelay: `${i * 0.7}s` }}>
                    {role.replace(/\s*\(.*\)$/, "")}
                  </span>
                </motion.span>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
