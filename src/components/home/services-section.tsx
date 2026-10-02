"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { ServiceItem } from "@/lib/data/content";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Reveal } from "@/components/motion/reveal";
import { ServiceGlyph } from "@/components/visuals/service-glyph";
import { useT } from "@/i18n/client";

type Service = Pick<ServiceItem, "slug" | "shortTitle" | "tagline" | "capabilities">;

export function ServicesSection({ services }: { services: Service[] }) {
  const t = useT().home.services;
  const [active, setActive] = useState(0);
  const current = services[active];

  return (
    <section aria-labelledby="services-title" className="relative py-24 md:py-36">
      <div className="container-x">
        <div className="mb-14 grid gap-8 md:mb-20 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <SectionLabel index="01" className="mb-6">
              {t.label}
            </SectionLabel>
            <h2 id="services-title" className="text-display-lg font-medium">
              <SplitReveal lines={[t.title1, { text: t.title2, className: "accent-serif text-flux" }]} />
            </h2>
          </div>
          <Reveal className="md:col-span-4" delay={0.2}>
            <p className="leading-relaxed text-fog-400">
              {t.intro}
            </p>
          </Reveal>
        </div>

        <div className="grid gap-10 lg:grid-cols-12">
          <ul className="border-t border-line lg:col-span-7">
            {services.map((service, i) => (
              <li key={service.slug} className="border-b border-line">
                <Link
                  href={`/services#${service.slug}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className="group relative flex items-center gap-5 py-5 outline-offset-[-2px] md:gap-8 md:py-7"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-0 left-0 -z-10 w-full origin-left bg-gradient-to-r from-flux/[0.09] to-transparent transition-transform duration-700 ease-(--ease-out-expo)",
                      active === i ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                  <span
                    className={cn(
                      "w-8 font-mono text-xs transition-colors duration-500",
                      active === i ? "text-flux" : "text-fog-500",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "flex-1 text-[clamp(1.75rem,3.6vw,3.25rem)] font-medium leading-none tracking-[-0.045em] transition-[transform,color] duration-700 ease-(--ease-out-expo)",
                      active === i ? "translate-x-2 text-fog-50 md:translate-x-4" : "text-fog-400",
                    )}
                  >
                    {service.shortTitle}
                  </span>
                  <span className="size-12 shrink-0 lg:hidden">
                    <ServiceGlyph slug={service.slug} />
                  </span>
                  <ArrowUpRight
                    size={22}
                    className={cn(
                      "hidden shrink-0 transition-all duration-500 ease-(--ease-out-expo) lg:block",
                      active === i ? "translate-x-0 text-flux opacity-100" : "-translate-x-3 opacity-0",
                    )}
                  />
                </Link>
              </li>
            ))}
          </ul>

          {/* Sticky preview (desktop) */}
          <div className="hidden lg:col-span-5 lg:block">
            <div className="sticky top-28">
              <div className="grain relative overflow-hidden rounded-xl border border-line bg-ink-900 p-10">
                <div aria-hidden="true" className="grid-lines absolute inset-0 opacity-30" />
                <div
                  aria-hidden="true"
                  className="absolute -right-24 -top-24 size-80 rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.18),transparent_65%)]"
                />
                <AnimatePresence mode="wait">
                  {current && (
                    <motion.div
                      key={current.slug}
                      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                      transition={{ duration: 0.5, ease: ease.outExpo }}
                      className="relative"
                      aria-live="polite"
                    >
                      <div className="mx-auto mb-10 size-44">
                        <ServiceGlyph slug={current.slug} active />
                      </div>
                      <p className="text-2xl font-medium leading-snug tracking-[-0.02em] text-fog-50">{current.tagline}</p>
                      <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-6">
                        {current.capabilities.slice(0, 6).map((c) => (
                          <li key={c} className="flex gap-2 text-sm leading-snug text-fog-400">
                            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-flux" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-6 flex justify-end">
                <ButtonLink href="/services" variant="secondary" arrow>
                  {t.all}
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 lg:hidden">
          <ButtonLink href="/services" variant="secondary" arrow>
            {t.all}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
