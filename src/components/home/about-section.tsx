import { pillars } from "@/content/company";
import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Reveal } from "@/components/motion/reveal";
import { ScrollText } from "@/components/motion/scroll-text";

export function AboutSection() {
  return (
    <section aria-labelledby="about-title" className="relative py-24 md:py-36">
      <div className="container-x">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <SectionLabel index="04">About MovEra</SectionLabel>
            <h2 id="about-title" className="sr-only">
              About MovEra
            </h2>
          </div>
          <div className="lg:col-span-9">
            <ScrollText
              className="text-[clamp(1.6rem,3.3vw,3.1rem)] font-medium leading-[1.12] tracking-[-0.035em] text-fog-50"
              text="MovEra is a small, senior team of designers and engineers. We combine design, technology, strategy and engineering to turn ideas into digital products — and we stay close long after launch, because the best products never stop moving."
            />
            <Reveal className="mt-10">
              <ButtonLink href="/about" variant="secondary" arrow>
                More about us
              </ButtonLink>
            </Reveal>
          </div>
        </div>

        <ul className="mt-20 grid border-t border-line sm:grid-cols-2 lg:mt-28 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <Reveal
              as="li"
              key={p.title}
              delay={i * 0.08}
              className="group relative border-b border-line py-8 sm:odd:border-r sm:odd:pr-8 sm:even:pl-8 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0"
            >
              <span aria-hidden="true" className="absolute left-0 top-0 h-px w-0 bg-flux transition-all duration-700 ease-(--ease-out-expo) group-hover:w-full" />
              <p className="font-mono text-xs text-flux">+{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-6 text-3xl font-medium tracking-[-0.04em]">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-fog-400">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
