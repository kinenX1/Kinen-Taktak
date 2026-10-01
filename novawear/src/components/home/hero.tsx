"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Figure, type FigureLook } from "@/components/brand/figure";
import { Runner, SpinBadge } from "@/components/brand/motion-marks";
import { Magnetic } from "@/components/motion/magnetic";
import { ButtonLink } from "@/components/ui/button";

const ink = "#151514";
const bone = "#ECE8DF";

type Model = FigureLook & { h: string; delay: number; bob: number; z: number; label: string };

/** Seven models in a line-up, tallest in the middle — like a studio campaign shot. */
const lineup: Model[] = [
  { skin: "#6E4630", top: bone, pants: ink, hair: true, joggers: true, h: "clamp(200px, 26vw, 360px)", delay: 0.95, bob: 0, z: 1, label: "Model in a bone tee and ink track pants" },
  { skin: "#C99872", top: "#4B3427", pants: "#4B3427", hair: true, h: "clamp(230px, 31vw, 420px)", delay: 0.8, bob: 0.6, z: 2, label: "Model in a chocolate tee and pants" },
  { skin: "#3B2A20", top: "#9C9B97", pants: "#9C9B97", long: true, hood: true, joggers: true, h: "clamp(260px, 36vw, 490px)", delay: 0.65, bob: 1.2, z: 3, label: "Model in a grey hoodie set" },
  { skin: "#8A5A3C", top: ink, pants: ink, long: true, hood: true, joggers: true, h: "clamp(300px, 42vw, 570px)", delay: 0.5, bob: 0.3, z: 4, label: "Model in the ink Prowl Hoodie" },
  { skin: "#E0B48F", top: "#C9892E", pants: ink, hair: true, h: "clamp(260px, 36vw, 490px)", delay: 0.65, bob: 0.9, z: 3, label: "Model in a leopard tee" },
  { skin: "#5C3B28", top: bone, pants: bone, long: true, hood: true, h: "clamp(230px, 31vw, 420px)", delay: 0.8, bob: 1.5, z: 2, label: "Model in a bone hoodie set" },
  { skin: "#A8714F", top: "#5D6047", pants: "#5D6047", long: true, hair: true, joggers: true, h: "clamp(200px, 26vw, 360px)", delay: 0.95, bob: 0.45, z: 1, label: "Model in an olive set" },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "38%"]);
  const crowdY = useTransform(scrollYProgress, [0, 1], ["0%", "-10%"]);
  const crowdScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);

  return (
    <section ref={ref} aria-labelledby="hero-title" className="container-x">
      <div className="relative h-[clamp(540px,62vw,900px)] overflow-hidden">
        <div className="eyebrow absolute inset-x-0 top-5 z-10 flex justify-between">
          <span>Drop 01 — Leopard Season</span>
          <span className="hidden items-center gap-2 sm:flex">
            <span className="size-2 animate-blink rounded-full bg-ink" />
            Pre-orders open
          </span>
        </div>

        <motion.h1
          id="hero-title"
          aria-label="NovaWear — Drop 01"
          style={reduce ? undefined : { y: textY }}
          className="display absolute inset-x-0 top-[clamp(56px,5vw,80px)] overflow-hidden whitespace-nowrap text-center text-[clamp(170px,31vw,460px)] leading-[0.8] text-stone"
        >
          {"Nova".split("").map((ch, i) => (
            <span key={i} aria-hidden="true" className="letter" style={{ animationDelay: `${0.05 + i * 0.08}s` }}>
              {ch}
            </span>
          ))}
        </motion.h1>

        <motion.div
          style={reduce ? undefined : { y: crowdY, scale: crowdScale }}
          className="absolute inset-x-0 bottom-[3%] flex origin-bottom items-end justify-center"
        >
          {lineup.map((m) => (
            <div key={m.label} className="relative -mx-[1.3vw] animate-rise" style={{ animationDelay: `${m.delay}s`, zIndex: m.z }}>
              <div className="animate-bob" style={{ animationDelay: `${m.bob}s` }}>
                <Figure look={m} label={m.label} style={{ height: m.h }} />
              </div>
            </div>
          ))}
        </motion.div>

        <Runner className="bottom-[1.5%] z-20 w-[clamp(110px,12vw,180px)]" />
        <div className="absolute right-[1%] top-[40%] z-20 hidden w-[clamp(120px,11vw,168px)] md:block">
          <SpinBadge />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6 border-t-2 border-ink pb-16 pt-7">
        <div className="max-w-xl">
          <p className="eyebrow mb-3.5">New collection</p>
          <h2 className="display text-[clamp(3rem,6vw,5.5rem)]">Run with the pack.</h2>
          <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-body">
            Tees, pants, hoodies and pyjamas marked with the N and the running leopard. Order what&apos;s in stock, pre-order what&apos;s coming next.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Magnetic>
            <ButtonLink href="/shop" size="lg" arrow>
              Shop the drop
            </ButtonLink>
          </Magnetic>
          <Magnetic>
            <ButtonLink href="/shop?availability=pre-order" variant="outline" size="lg">
              Pre-order
            </ButtonLink>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
