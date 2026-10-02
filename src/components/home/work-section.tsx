import type { PortfolioItem } from "@/lib/data/content";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Reveal } from "@/components/motion/reveal";
import { SplitReveal } from "@/components/motion/split-reveal";
import { ProjectEntry } from "@/components/work/project-entry";
import type { Dictionary } from "@/i18n/dictionaries";

export function WorkSection({ projects, t }: { projects: PortfolioItem[]; t: Dictionary["home"]["work"] }) {
  const [lead, ...rest] = projects;
  return (
    <section aria-labelledby="work-title" className="relative py-24 md:py-36">
      <div className="container-x">
        <div className="mb-14 flex flex-col gap-8 md:mb-20 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionLabel index="02" className="mb-6">
              {t.label}
            </SectionLabel>
            <h2 id="work-title" className="text-display-lg font-medium">
              <SplitReveal lines={[t.title1, { text: t.title2, className: "text-fog-400" }]} />
            </h2>
          </div>
          <Reveal delay={0.2} className="max-w-sm space-y-6">
            <p className="leading-relaxed text-fog-400">
              {t.intro}
            </p>
            <ButtonLink href="/work" variant="secondary" arrow>
              {t.all}
            </ButtonLink>
          </Reveal>
        </div>

        {lead && (
          <Reveal>
            <ProjectEntry project={lead} index={0} size="large" />
          </Reveal>
        )}

        <div className="mt-20 grid gap-20 md:mt-28 md:grid-cols-2 md:gap-x-10 md:gap-y-28 lg:gap-x-16">
          {rest.map((project, i) => {
            // An odd trailing project spans the full width instead of leaving a gap.
            const trailing = rest.length % 2 === 1 && i === rest.length - 1;
            return (
              <Reveal key={project.slug} className={cn(i % 2 === 1 && "md:mt-40", trailing && "md:col-span-2")}>
                <ProjectEntry project={project} index={i + 1} size={trailing ? "large" : "medium"} />
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
