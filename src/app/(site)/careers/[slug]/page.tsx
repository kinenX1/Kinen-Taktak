import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpeningBySlug } from "@/lib/data/content";
import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { ArrowLeft, Check, Clock, MapPin, Spark, Users } from "@/components/ui/icons";
import { SectionLabel } from "@/components/ui/section-label";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/magnetic";

export async function generateMetadata({ params }: PageProps<"/careers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { locale, t } = await getI18n();
  const role = await getOpeningBySlug(locale, slug);
  if (!role) return { title: t.meta.notFound };
  return {
    title: `${role.title} — ${t.meta.careers.title}`,
    description: role.summary,
    alternates: { canonical: `/careers/${role.slug}` },
  };
}

export default async function RolePage({ params }: PageProps<"/careers/[slug]">) {
  const { slug } = await params;
  const { locale, t } = await getI18n();
  const c = t.careers;
  const role = await getOpeningBySlug(locale, slug);
  if (!role) notFound();

  const mode = t.options.workModes[role.workMode];
  const chips = [
    { icon: Users, text: role.team },
    { icon: MapPin, text: role.location === mode ? mode : `${role.location} · ${mode}` },
    { icon: Clock, text: t.options.employmentTypes[role.employmentType] },
  ];
  const lists = [
    { title: c.responsibilities, items: role.responsibilities, n: "01" },
    { title: c.requirements, items: role.requirements, n: "02" },
    ...(role.niceToHave.length ? [{ title: c.niceToHave, items: role.niceToHave, n: "03" }] : []),
  ];

  return (
    <article>
      <header className="relative overflow-hidden pt-[calc(var(--nav-height)+2.5rem)] pb-16 md:pt-[calc(var(--nav-height)+4rem)] md:pb-24">
        <div aria-hidden="true" className="grid-lines absolute inset-0 -z-10 opacity-30 [mask-image:radial-gradient(60%_60%_at_20%_0%,black,transparent)]" />
        <div aria-hidden="true" className="absolute -right-[20%] -top-[30%] -z-10 size-[60vw] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.12),transparent_60%)]" />
        <div className="container-x">
          <Link href="/careers#roles" className="group mb-10 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 transition-colors hover:text-fog-50">
            <ArrowLeft size={16} className="transition-transform duration-500 group-hover:-translate-x-1" />
            {c.backToRoles}
          </Link>
          <SectionLabel className="mb-6">{c.label}</SectionLabel>
          <h1 className="max-w-5xl text-display-lg font-medium">
            <SplitReveal immediate lines={[role.title]} />
          </h1>
          <Reveal delay={0.3} className="mt-8 flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, text }) => (
              <span key={text} className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-fog-200">
                <Icon size={15} className="text-flux" /> {text}
              </span>
            ))}
          </Reveal>
          <div className="mt-12 grid gap-10 md:grid-cols-12 md:items-end">
            <Reveal delay={0.4} className="md:col-span-7">
              <p className="text-lead text-fog-200">{role.summary}</p>
            </Reveal>
            <Reveal delay={0.5} className="md:col-span-5 md:flex md:justify-end">
              <Magnetic>
                <ButtonLink href={`/careers/apply?role=${role.slug}`} size="lg" arrow>
                  {c.applyFor}
                </ButtonLink>
              </Magnetic>
            </Reveal>
          </div>
        </div>
      </header>

      <div className="container-x grid gap-6 pb-24 md:grid-cols-2 lg:grid-cols-3 md:pb-32">
        {lists.map((list, i) => (
          <Reveal key={list.title} delay={i * 0.08} className="rounded-xl border border-line bg-ink-900/60 p-7 md:p-8">
            <p className="font-mono text-xs text-flux">({list.n})</p>
            <h2 className="mt-4 text-2xl font-medium tracking-[-0.03em]">{list.title}</h2>
            <ul className="mt-6 space-y-4">
              {list.items.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed text-fog-200">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-flux/15 text-flux">
                    {list.n === "03" ? <Spark size={11} /> : <Check size={11} strokeWidth={2.6} />}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>

      <section className="grain relative overflow-hidden border-t border-line py-24 md:py-32">
        <div aria-hidden="true" className="absolute inset-x-0 -bottom-1/2 mx-auto size-[50rem] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.16),transparent_60%)]" />
        <div className="container-x relative flex flex-col items-start gap-10 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-3xl text-display-lg font-medium">
            <SplitReveal lines={[c.form.title1, { text: c.form.title2, className: "accent-serif text-flux" }]} />
          </h2>
          <ButtonLink href={`/careers/apply?role=${role.slug}`} size="lg" arrow>
            {c.applyNow}
          </ButtonLink>
        </div>
      </section>
    </article>
  );
}
