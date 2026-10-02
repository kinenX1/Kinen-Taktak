"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { PortfolioCategory } from "@prisma/client";
import { portfolioFilters } from "@/config/portfolio";
import type { PortfolioItem } from "@/lib/data/content";
import { ease } from "@/lib/motion";
import { fmt } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { ProjectEntry } from "./project-entry";

/**
 * Filterable portfolio. Filtering happens on the client so the page can stay
 * statically rendered; the active filter is mirrored into the URL (?type=)
 * so filtered views can be shared.
 */
export function WorkGrid({ projects, initialFilter }: { projects: PortfolioItem[]; initialFilter?: string }) {
  const t = useT();
  const [filter, setFilter] = useState(() => portfolioFilters.find((f) => f.slug === initialFilter)?.slug ?? "all");
  const active = portfolioFilters.find((f) => f.slug === filter)!;
  const visible = active.value ? projects.filter((p) => p.category === active.value) : projects;

  const counts = projects.reduce<Partial<Record<PortfolioCategory, number>>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  const choose = (slug: string) => {
    setFilter(slug);
    const url = new URL(window.location.href);
    if (slug === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", slug);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="container-x pb-24 md:pb-36">
      <div className="sticky top-3 z-30 -mx-(--gutter) mb-14 px-(--gutter) md:top-4">
        <div role="group" aria-label={t.work.filterLabel} className="glass no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5 shadow-[var(--shadow-float)]">
          {portfolioFilters.map((f) => {
            const count = f.value ? (counts[f.value] ?? 0) : projects.length;
            const isActive = f.slug === filter;
            return (
              <button
                key={f.slug}
                type="button"
                onClick={() => choose(f.slug)}
                aria-pressed={isActive}
                className={cn(
                  "relative flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors duration-300",
                  isActive ? "text-ink-950" : "text-fog-200 hover:text-fog-50",
                )}
              >
                {isActive && (
                  <motion.span layoutId="work-filter" className="absolute inset-0 rounded-full bg-fog-50" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{t.options.filters[f.slug as keyof typeof t.options.filters]}</span>
                <span className={cn("relative font-mono text-2xs", isActive ? "text-ink-950/60" : "text-fog-500")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {visible.length === 1 ? t.work.showingOne : fmt(t.work.showing, { count: visible.length })}
      </p>

      <motion.div layout className="grid gap-x-10 gap-y-20 md:grid-cols-2 md:gap-y-28 lg:gap-x-16">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((project, i) => (
            <motion.div
              key={project.slug}
              layout
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
              transition={{ duration: 0.8, ease: ease.outExpo, delay: Math.min(i, 4) * 0.05 }}
              className={cn(i === 0 && visible.length > 2 && "md:col-span-2", i % 2 === 0 && i > 0 && "md:mt-32")}
            >
              <ProjectEntry project={project} index={i} size={i === 0 && visible.length > 2 ? "large" : "medium"} headingLevel="h2" priority={i === 0} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {visible.length === 0 && (
        <div className="flex flex-col items-start gap-6 border-t border-line py-20">
          <p className="text-display-md font-medium text-fog-400">{t.work.emptyTitle}</p>
          <p className="max-w-md leading-relaxed text-fog-400">
            {fmt(t.work.emptyBody, { category: t.options.filters[active.slug as keyof typeof t.options.filters].toLowerCase() })}
          </p>
          <ButtonLink href="/start-project" arrow>
            {t.nav.startProject}
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
