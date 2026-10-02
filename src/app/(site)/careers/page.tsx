import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedOpenings } from "@/lib/data/content";
import { getI18n } from "@/i18n/server";
import { SectionLabel } from "@/components/ui/section-label";
import { ArrowUpRight, Globe, Layers, Rocket, Clock, Spark, Users } from "@/components/ui/icons";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Reveal } from "@/components/motion/reveal";
import { CountUp } from "@/components/motion/count-up";
import { Marquee } from "@/components/motion/marquee";
import { CareersHero } from "@/components/careers/careers-hero";
import { SpotlightCard } from "@/components/careers/spotlight-card";
import { HiringSteps } from "@/components/careers/hiring-steps";
import { RolesBoard } from "@/components/careers/roles-board";
import { NewsletterForm } from "@/components/forms/newsletter-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.careers.title,
    description: t.meta.careers.description,
    alternates: { canonical: "/careers" },
    openGraph: { url: "/careers", title: `${t.meta.careers.title} — MovEra` },
  };
}

const perkIcons = [Globe, Rocket, Spark, Clock, Layers, Users];

export default async function CareersPage() {
  const { locale, t } = await getI18n();
  const c = t.careers;
  const openings = await getPublishedOpenings(locale);
  const teams = new Set(openings.map((o) => o.team)).size;

  const stats = [
    { value: openings.length, label: c.stats.roles },
    { value: teams, label: c.stats.teams },
    { value: 3, label: c.stats.founders },
  ];

  return (
    <>
      <CareersHero roles={openings.map((o) => o.title)} count={openings.length} />

      <div className="border-y border-line py-5" aria-hidden="true">
        <Marquee duration={50}>
          {openings.map((o) => (
            <span key={o.slug} className="flex items-center gap-8 px-8 text-[clamp(1.5rem,3.5vw,2.75rem)] font-medium tracking-[-0.04em] text-outline">
              {o.title}
              <span className="size-2 rounded-full bg-flux" />
            </span>
          ))}
        </Marquee>
      </div>

      {/* ── Why MovEra ───────────────────── */}
      <section aria-labelledby="why-title" className="py-24 md:py-32">
        <div className="container-x">
          <div className="mb-14 grid gap-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-7">
              <SectionLabel index="01" className="mb-6">
                {c.whyLabel}
              </SectionLabel>
              <h2 id="why-title" className="text-display-lg font-medium">
                <SplitReveal lines={[c.why1, { text: c.why2, className: "accent-serif text-flux" }]} />
              </h2>
            </div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line md:col-span-5">
              {stats.map((s) => (
                <div key={s.label} className="scanline bg-ink-900 p-5">
                  <dd className="text-4xl font-medium tracking-[-0.05em] text-fog-50">
                    <CountUp value={s.value} />
                  </dd>
                  <dt className="mt-1 text-xs leading-snug text-fog-400">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.perks.map((p, i) => {
              const Icon = perkIcons[i % perkIcons.length]!;
              return (
                <Reveal as="li" key={p.title} delay={(i % 3) * 0.08}>
                  <SpotlightCard className="h-full">
                    <span className="flex size-11 items-center justify-center rounded-full border border-line text-flux transition-[transform,border-color] duration-500 group-hover:scale-110 group-hover:border-flux/60">
                      <Icon size={20} />
                    </span>
                    <h3 className="mt-6 text-2xl font-medium tracking-[-0.03em]">{p.title}</h3>
                    <p className="mt-2 leading-relaxed text-fog-400">{p.body}</p>
                  </SpotlightCard>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── How we hire ──────────────────── */}
      <section aria-labelledby="process-title" className="border-y border-line bg-ink-900/50 py-24 md:py-32">
        <div className="container-x">
          <SectionLabel index="02" className="mb-6">
            {c.processLabel}
          </SectionLabel>
          <h2 id="process-title" className="mb-16 text-display-lg font-medium">
            <SplitReveal lines={[c.process1, { text: c.process2, className: "accent-serif text-flux" }]} />
          </h2>
          <HiringSteps steps={c.steps} />
        </div>
      </section>

      {/* ── Open roles ───────────────────── */}
      <section id="roles" aria-labelledby="roles-title" className="scroll-mt-24 py-24 md:py-32">
        <div className="container-x">
          <SectionLabel index="03" className="mb-6">
            {c.openRoles}
          </SectionLabel>
          <h2 id="roles-title" className="mb-12 text-display-lg font-medium">
            <SplitReveal lines={[{ text: String(openings.length).padStart(2, "0"), className: "text-flux" }, c.openRoles.toLowerCase()]} />
          </h2>
          <RolesBoard
            roles={openings.map(({ slug, title, team, location, employmentType, workMode, summary }) => ({ slug, title, team, location, employmentType, workMode, summary }))}
          />

          <div className="mt-16 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Link
              href="/careers/apply?role=spontaneous"
              className="beam-border group relative flex flex-col justify-between gap-10 overflow-hidden rounded-xl bg-gradient-to-br from-flux/[0.14] via-ink-900 to-ink-900 p-8 md:p-10"
            >
              <div>
                <p className="eyebrow text-flux-soft">{c.spontaneous}</p>
                <p className="mt-4 max-w-md text-3xl font-medium leading-tight tracking-[-0.035em]">{c.spontaneousBody}</p>
              </div>
              <span className="inline-flex items-center gap-3 font-medium">
                {c.spontaneousCta}
                <span className="flex size-10 items-center justify-center rounded-full bg-flux text-ink-950 transition-transform duration-500 group-hover:rotate-45">
                  <ArrowUpRight size={18} />
                </span>
              </span>
            </Link>
            <div className="rounded-xl border border-line bg-ink-900/60 p-8 md:p-10">
              <p className="eyebrow">{c.notifyTitle}</p>
              <p className="mb-8 mt-4 max-w-md text-xl leading-snug tracking-[-0.02em] text-fog-200">{c.notifyBody}</p>
              <NewsletterForm source="careers" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
