"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import type { PortfolioItem } from "@/lib/data/content";
import { fmt } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { ProjectVisual } from "@/components/visuals/project-visual";
import { ProjectCoverLink } from "./project-cover-link";

type Props = {
  project: Pick<
    PortfolioItem,
    "slug" | "title" | "category" | "client" | "year" | "summary" | "technologies" | "accent" | "visualVariant" | "coverImage" | "isDemo"
  >;
  index: number;
  size?: "large" | "medium";
  headingLevel?: "h2" | "h3";
  priority?: boolean;
};

/** Editorial project block used on the home page and /work. */
export function ProjectEntry({ project, index, size = "medium", headingLevel = "h3", priority }: Props) {
  const t = useT();
  const Heading = headingLevel;
  const href = `/work/${project.slug}`;
  return (
    <article className="group">
      <ProjectCoverLink href={href} label={t.work.view} className="rounded-lg">
        <ViewTransition name={`project-${project.slug}`} share="morph" default="none">
          <ProjectVisual
            variant={project.visualVariant}
            accent={project.accent}
            title={project.title}
            coverImage={project.coverImage}
            priority={priority}
            className={cn("w-full rounded-lg", size === "large" ? "aspect-[4/3] md:aspect-[16/8]" : "aspect-[4/3]")}
            sizes={size === "large" ? "100vw" : "(min-width: 768px) 50vw, 100vw"}
          />
        </ViewTransition>
      </ProjectCoverLink>

      <div className={cn("mt-6 grid gap-4", size === "large" && "md:grid-cols-12 md:gap-8")}>
        <div className={cn(size === "large" && "md:col-span-5")}>
          <p className="eyebrow flex flex-wrap items-center gap-3">
            <span className="text-flux">{String(index + 1).padStart(2, "0")}</span>
            <span>{t.options.categories[project.category]}</span>
            <span aria-hidden="true">·</span>
            <span>{project.year}</span>
            {project.isDemo && (
              <Badge className="ml-1" tone="neutral">
                {t.common.concept}
              </Badge>
            )}
          </p>
          <Heading className="mt-3 text-[clamp(1.9rem,3.4vw,3rem)] font-medium leading-[1] tracking-[-0.045em]">
            <Link href={href} className="group/title inline-flex items-center gap-3">
              <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-1 transition-[background-size] duration-700 ease-(--ease-out-expo) group-hover:bg-[length:100%_1px]">
                {project.title}
              </span>
            </Link>
          </Heading>
        </div>
        <div className={cn("space-y-5", size === "large" && "md:col-span-7 md:pt-8")}>
          <p className="max-w-xl leading-relaxed text-fog-400">{project.summary}</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs uppercase tracking-[0.1em] text-fog-500" aria-label={t.work.technologies}>
              {project.technologies.slice(0, 4).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <Link
              href={href}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fog-50"
              aria-label={fmt(t.work.viewProjectLabel, { title: project.title })}
            >
              {t.work.viewProject}
              <span className="flex size-8 items-center justify-center rounded-full border border-line-strong transition-all duration-500 ease-(--ease-out-expo) group-hover:rotate-45 group-hover:border-flux group-hover:bg-flux group-hover:text-ink-950">
                <ArrowUpRight size={15} />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
