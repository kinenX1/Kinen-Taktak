import type { Metadata } from "next";
import { pillars, values } from "@/content/company";
import { PageHero } from "@/components/layout/page-hero";
import { SectionLabel } from "@/components/ui/section-label";
import { Reveal } from "@/components/motion/reveal";
import { ScrollText } from "@/components/motion/scroll-text";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Marquee } from "@/components/motion/marquee";
import { NameEquation } from "@/components/about/name-equation";
import { ProcessSection } from "@/components/home/process-section";
import { FinalCta } from "@/components/home/final-cta";
import { FlowBand } from "@/components/about/flow-band";

export const metadata: Metadata = {
  title: "About",
  description:
    "MovEra is a digital product studio combining design, technology, strategy and engineering to turn ideas into digital products.",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", title: "About — MovEra" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        label="About"
        title={["A studio built", "around", { text: "momentum.", className: "accent-serif text-flux" }]}
        intro="We're designers, engineers and strategists who believe good software should feel effortless to use — and be a pleasure to maintain."
      />

      {/* ── Who we are / the name ─────────── */}
      <section aria-labelledby="who-title" className="border-t border-line py-24 md:py-32">
        <div className="container-x">
          <SectionLabel index="01" className="mb-10">
            <span id="who-title">Who we are</span>
          </SectionLabel>
          <NameEquation />
        </div>
      </section>

      {/* ── What we do ────────────────────── */}
      <section aria-labelledby="what-title" className="py-24 md:py-32">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel index="02">
              <span id="what-title">What we do</span>
            </SectionLabel>
          </div>
          <div className="lg:col-span-8">
            <ScrollText
              className="text-[clamp(1.5rem,3vw,2.75rem)] font-medium leading-[1.15] tracking-[-0.035em] text-fog-50"
              text="We turn ideas into websites, applications and software that people actually enjoy using. Strategy tells us what to build, design makes it clear, engineering makes it solid — and we bring all three to every project."
            />
            <ul className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
              {pillars.map((p, i) => (
                <Reveal as="li" key={p.title} delay={i * 0.06} className="bg-ink-950 p-7">
                  <p className="font-mono text-xs text-flux">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 text-2xl font-medium tracking-[-0.03em]">{p.title}</h3>
                  <p className="mt-2 leading-relaxed text-fog-400">{p.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Mission & vision ──────────────── */}
      <section aria-label="Mission and vision" className="relative overflow-hidden border-y border-line">
        <FlowBand />
        <div className="container-x relative grid gap-16 py-24 md:py-36 lg:grid-cols-2">
          <div>
            <SectionLabel index="03" className="mb-8">
              Mission
            </SectionLabel>
            <h2 className="text-display-md font-medium">
              <SplitReveal lines={["Help ambitious businesses", { text: "move faster", className: "text-flux" }, "with software they can trust."]} />
            </h2>
          </div>
          <div className="lg:pt-32">
            <SectionLabel index="04" className="mb-8">
              Vision
            </SectionLabel>
            <h2 className="text-display-md font-medium">
              <SplitReveal lines={["A world where great digital", "products aren't reserved", { text: "for the biggest companies.", className: "accent-serif text-fog-400" }]} />
            </h2>
          </div>
        </div>
      </section>

      {/* ── Values ────────────────────────── */}
      <section aria-labelledby="values-title" className="py-24 md:py-36">
        <div className="container-x">
          <SectionLabel index="05" className="mb-6">
            Values
          </SectionLabel>
          <h2 id="values-title" className="mb-14 max-w-3xl text-display-lg font-medium">
            <SplitReveal lines={["What we", { text: "stand for.", className: "accent-serif text-flux" }]} />
          </h2>
          <ol className="border-t border-line">
            {values.map((v, i) => (
              <Reveal as="li" key={v.title} delay={i * 0.04} className="group border-b border-line">
                <div className="grid gap-4 py-8 transition-[padding] duration-700 ease-(--ease-out-expo) md:grid-cols-12 md:items-baseline md:py-10 md:hover:pl-4">
                  <span className="font-mono text-xs text-fog-500 transition-colors group-hover:text-flux md:col-span-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[clamp(1.6rem,3vw,2.6rem)] font-medium leading-tight tracking-[-0.04em] md:col-span-6">{v.title}</h3>
                  <p className="leading-relaxed text-fog-400 md:col-span-5">{v.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <ProcessSection labelIndex="06" />

      {/* ── Philosophy ────────────────────── */}
      <section aria-labelledby="philosophy-title" className="overflow-hidden border-t border-line py-24 md:py-36">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel index="07">
              <span id="philosophy-title">Philosophy</span>
            </SectionLabel>
          </div>
          <div className="space-y-10 lg:col-span-8">
            <Reveal>
              <blockquote className="text-[clamp(1.75rem,3.6vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.04em]">
                “Software is never finished. The question is only whether it&apos;s{" "}
                <span className="accent-serif text-flux">moving forward</span> or falling behind.”
              </blockquote>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-2xl text-lg leading-relaxed text-fog-400">
                That&apos;s why we design for change: clean architecture, documented decisions and design systems that let
                products grow without starting over. We&apos;d rather ship something focused and improve it with real
                feedback than spend a year polishing guesses.
              </p>
            </Reveal>
          </div>
        </div>
        <div className="mt-20 border-y border-line py-6">
          <Marquee duration={60} reverse>
            {["Clarity", "Momentum", "Craft", "Honesty", "Ownership", "Accessibility"].map((w) => (
              <span key={w} className="flex items-center gap-10 px-10 text-[clamp(2.5rem,6vw,5rem)] font-medium tracking-[-0.05em] text-outline">
                {w}
                <span className="size-3 rounded-full bg-flux" aria-hidden="true" />
              </span>
            ))}
          </Marquee>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
