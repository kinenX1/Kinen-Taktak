import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig, activeSocials } from "@/config/site";
import { getI18n } from "@/i18n/server";
import { PageHero } from "@/components/layout/page-hero";
import { ContactForm } from "@/components/forms/contact-form";
import { ArrowUpRight } from "@/components/ui/icons";
import { Reveal } from "@/components/motion/reveal";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.contact.title,
    description: t.meta.contact.description,
    alternates: { canonical: "/contact" },
    openGraph: { url: "/contact", title: `${t.meta.contact.title} — MovEra` },
  };
}

export default async function ContactPage() {
  const { t } = await getI18n();
  const tc = t.contact;
  const socials = activeSocials();
  return (
    <>
      <PageHero label={tc.label} title={[tc.title1, { text: tc.title2, className: "accent-serif text-flux" }]} />
      <section className="container-x grid gap-14 pb-24 md:pb-36 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-5">
          <Reveal>
            <p className="text-lead text-fog-200">
              {tc.intro}
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <Link
              href="/start-project"
              className="group relative block overflow-hidden rounded-xl border border-flux/30 bg-gradient-to-br from-flux/[0.14] via-ink-900 to-ink-900 p-8 transition-colors duration-500 hover:border-flux/60"
            >
              <p className="eyebrow text-flux-soft">{tc.cardEyebrow}</p>
              <p className="mt-4 text-3xl font-medium leading-tight tracking-[-0.035em]">{tc.cardTitle}</p>
              <span className="mt-8 inline-flex items-center gap-3 font-medium">
                {tc.cardCta}
                <span className="flex size-9 items-center justify-center rounded-full bg-flux text-ink-950 transition-transform duration-500 group-hover:rotate-45">
                  <ArrowUpRight size={16} />
                </span>
              </span>
            </Link>
          </Reveal>

          <Reveal delay={0.2}>
            <dl className="grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
              <div>
                <dt className="eyebrow">{tc.email}</dt>
                <dd className="mt-2">
                  <a href={`mailto:${siteConfig.email}`} className="text-fog-50 underline-offset-4 hover:underline">
                    {siteConfig.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="eyebrow">{tc.workingWith}</dt>
                <dd className="mt-2 text-fog-50">{tc.workingWithValue}</dd>
              </div>
              {socials.length > 0 && (
                <div>
                  <dt className="eyebrow">{tc.social}</dt>
                  <dd className="mt-2 flex flex-wrap gap-4">
                    {socials.map((s) => (
                      <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="text-fog-50 hover:text-flux">
                        {s.label}
                      </a>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </Reveal>
        </div>
        <div className="lg:col-span-7">
          <Reveal delay={0.15}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
