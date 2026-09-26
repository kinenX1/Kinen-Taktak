import type { ReactNode } from "react";
import { SectionLabel } from "@/components/ui/section-label";
import { SplitReveal, type SplitLine } from "@/components/motion/split-reveal";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/** Opening statement for inner pages. */
export function PageHero({
  label,
  title,
  intro,
  children,
  className,
}: {
  label: string;
  title: SplitLine[];
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden pt-[calc(var(--nav-height)+4rem)] pb-16 md:pt-[calc(var(--nav-height)+7rem)] md:pb-24", className)}>
      <div aria-hidden="true" className="absolute -right-[20%] -top-[30%] -z-10 size-[70vw] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.1),transparent_60%)]" />
      <div aria-hidden="true" className="grid-lines absolute inset-0 -z-10 opacity-[0.35] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
      <div className="container-x">
        <SectionLabel className="mb-8">{label}</SectionLabel>
        <h1 className="max-w-6xl text-display-xl font-medium">
          <SplitReveal immediate delay={0.1} lines={title} />
        </h1>
        {(intro || children) && (
          <div className="mt-10 grid gap-8 md:mt-14 md:grid-cols-12">
            {intro && (
              <Reveal delay={0.5} className="md:col-span-6 md:col-start-7">
                <div className="text-lead text-fog-400">{intro}</div>
              </Reveal>
            )}
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
