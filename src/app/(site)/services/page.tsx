import type { Metadata } from "next";
import Link from "next/link";
import type { ProjectType } from "@prisma/client";
import { getPublishedProjects, getPublishedServices } from "@/lib/data/content";
import { getI18n } from "@/i18n/server";
import { PageHero } from "@/components/layout/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { ArrowUpRight } from "@/components/ui/icons";
import { Reveal } from "@/components/motion/reveal";
import { ServiceGlyph } from "@/components/visuals/service-glyph";
import { ProjectVisual } from "@/components/visuals/project-visual";
import { ProcessSection } from "@/components/home/process-section";
import { FinalCta } from "@/components/home/final-cta";
import { ServicesIndex } from "@/components/services/services-index";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.services.title,
    description: t.meta.services.description,
    alternates: { canonical: "/services" },
    openGraph: { url: "/services", title: `${t.meta.services.title} — MovEra` },
  };
}

/** Maps a service to the project type pre-selected on /start-project. */
const briefType: Record<string, ProjectType> = {
  websites: "WEBSITE",
  "web-apps": "WEB_APP",
  "mobile-apps": "MOBILE_APP",
  "ui-ux-design": "UI_UX",
  "custom-software": "CUSTOM_SOFTWARE",
  "e-commerce": "ECOMMERCE",
  saas: "SAAS",
  automation: "AUTOMATION",
  "ai-products": "AI",
};

export default async function ServicesPage() {
  const { locale, t } = await getI18n();
  const ts = t.services;
  const categoryLabel = t.options.categories;
  const [services, projects] = await Promise.all([getPublishedServices(locale), getPublishedProjects(locale)]);

  return (
    <>
      <PageHero label={ts.label} title={[ts.title1, { text: ts.title2, className: "accent-serif text-flux" }]} intro={ts.intro} />

      <ServicesIndex label={ts.label} items={services.map((s) => ({ slug: s.slug, label: s.shortTitle }))} />

      {services.map((service, i) => {
        const examples = projects.filter((p) => service.relatedCategories.includes(p.category)).slice(0, 2);
        return (
          <section
            key={service.slug}
            id={service.slug}
            aria-labelledby={`${service.slug}-title`}
            className="scroll-mt-24 border-t border-line py-20 md:py-28"
          >
            <div className="container-x">
              <div className="grid gap-10 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <div className="lg:sticky lg:top-40">
                    <p className="eyebrow flex items-center gap-3">
                      <span className="text-flux">{String(i + 1).padStart(2, "0")}</span>
                      <span aria-hidden="true" className="h-px w-8 bg-line-strong" />
                      {service.shortTitle}
                    </p>
                    <h2 id={`${service.slug}-title`} className="mt-6 text-display-md font-medium">
                      {service.title}
                    </h2>
                    <p className="mt-5 text-lead text-fog-200">{service.tagline}</p>
                    <div className="group mt-10 hidden size-40 lg:block">
                      <ServiceGlyph slug={service.slug} />
                    </div>
                  </div>
                </div>

                <div className="space-y-14 lg:col-span-7">
                  <Reveal>
                    <p className="text-lg leading-relaxed text-fog-200">{service.description}</p>
                    <div className="mt-8 rounded-lg border border-line bg-ink-900/60 p-6">
                      <p className="eyebrow mb-3">{ts.whoFor}</p>
                      <p className="leading-relaxed text-fog-200">{service.audience}</p>
                    </div>
                  </Reveal>

                  <div className="grid gap-12 sm:grid-cols-2">
                    <Reveal>
                      <h3 className="eyebrow mb-5">{ts.provide}</h3>
                      <ul className="divide-y divide-line border-y border-line">
                        {service.capabilities.map((c) => (
                          <li key={c} className="py-3 text-fog-50">
                            {c}
                          </li>
                        ))}
                      </ul>
                    </Reveal>
                    <Reveal delay={0.1}>
                      <h3 className="eyebrow mb-5">{ts.get}</h3>
                      <ul className="space-y-4">
                        {service.benefits.map((b) => (
                          <li key={b} className="flex gap-3 leading-snug text-fog-200">
                            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-flux" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </Reveal>
                  </div>

                  <Reveal>
                    <h3 className="eyebrow mb-5">{ts.technologies}</h3>
                    <ul className="flex flex-wrap gap-2">
                      {service.technologies.map((t) => (
                        <li key={t} className="rounded-full border border-line px-3.5 py-1.5 font-mono text-xs text-fog-200">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Reveal>

                  {examples.length > 0 && (
                    <Reveal>
                      <h3 className="eyebrow mb-5">{ts.examples}</h3>
                      <ul className="grid gap-4 sm:grid-cols-2">
                        {examples.map((p) => (
                          <li key={p.slug}>
                            <Link href={`/work/${p.slug}`} className="group block">
                              <ProjectVisual
                                variant={p.visualVariant}
                                accent={p.accent}
                                title={p.title}
                                coverImage={p.coverImage}
                                className="aspect-[16/10] rounded-md"
                                sizes="(min-width: 1024px) 25vw, 50vw"
                              />
                              <span className="mt-3 flex items-center justify-between text-sm">
                                <span className="text-fog-50">
                                  {p.title}
                                  <span className="text-fog-500"> — {categoryLabel[p.category]}</span>
                                </span>
                                <ArrowUpRight size={16} className="text-fog-400 transition-transform duration-500 group-hover:rotate-45 group-hover:text-flux" />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </Reveal>
                  )}

                  <Reveal>
                    <ButtonLink href={`/start-project?type=${briefType[service.slug] ?? "OTHER"}`} arrow>
                      {ts.start}
                    </ButtonLink>
                  </Reveal>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <ProcessSection labelIndex="—" />
      <FinalCta title={[ts.ctaTitle1, ts.ctaTitle2]} cta={ts.ctaButton} />
    </>
  );
}
