import Link from "next/link";
import { activeSocials, legalNav, mainNav, siteConfig } from "@/config/site";
import { serviceSeeds } from "@/content/services";
import { servicesFr } from "@/content/fr/services";
import { getI18n } from "@/i18n/server";
import { ArrowUpRight } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { LogoMark } from "./wordmark";
import { BackToTop } from "./back-to-top";

export async function Footer() {
  const { locale, t } = await getI18n();
  const socials = activeSocials();
  const year = new Date().getFullYear();
  const serviceLabel = (s: (typeof serviceSeeds)[number]) => (locale === "fr" ? (servicesFr[s.slug]?.shortTitle ?? s.shortTitle) : s.shortTitle);

  return (
    <footer className="relative overflow-hidden border-t border-line bg-ink-950">
      <div className="container-x pt-20 pb-10 md:pt-28">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow mb-6">{t.footer.eyebrow}</p>
            <p className="max-w-md text-2xl leading-snug tracking-[-0.02em] text-fog-50 md:text-3xl">
              {t.footer.statement} <span className="accent-serif text-flux">{t.footer.statementAccent}</span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ButtonLink href="/start-project" arrow>
                {t.nav.startProject}
              </ButtonLink>
              <a
                href={`mailto:${siteConfig.email}`}
                className="group inline-flex min-h-11 items-center gap-2 text-fog-200 transition-colors hover:text-fog-50"
              >
                {siteConfig.email}
                <ArrowUpRight size={16} className="transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>
            <div className="mt-12 max-w-md">
              <p className="font-medium text-fog-50">{t.footer.newsletterTitle}</p>
              <p className="mb-4 mt-1 text-sm leading-relaxed text-fog-400">{t.footer.newsletterBody}</p>
              <NewsletterForm />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7 lg:pl-10">
            <FooterColumn title={t.footer.navigate}>
              {mainNav.map((l) => (
                <FooterLink key={l.href} href={l.href}>
                  {t.nav[l.key]}
                </FooterLink>
              ))}
              <FooterLink href="/start-project">{t.nav.startProject}</FooterLink>
            </FooterColumn>
            <FooterColumn title={t.footer.servicesTitle}>
              {serviceSeeds.slice(0, 7).map((s) => (
                <FooterLink key={s.slug} href={`/services#${s.slug}`}>
                  {serviceLabel(s)}
                </FooterLink>
              ))}
            </FooterColumn>
            <FooterColumn title={t.footer.clients}>
              <FooterLink href="/login">{t.nav.login}</FooterLink>
              <FooterLink href="/register">{t.footer.createAccount}</FooterLink>
              <FooterLink href="/dashboard">{t.nav.clientPortal}</FooterLink>
              <FooterLink href="/careers">{t.nav.careers}</FooterLink>
              {socials.length > 0 && (
                <li className="pt-4">
                  <p className="eyebrow mb-3">{t.footer.social}</p>
                  <ul className="space-y-2.5">
                    {socials.map((s) => (
                      <li key={s.label}>
                        <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-fog-400 transition-colors hover:text-fog-50">
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </FooterColumn>
          </div>
        </div>
      </div>

      {/* Oversized wordmark — the brand signs off every page */}
      <div aria-hidden="true" className="container-x select-none">
        <div className="relative flex items-end gap-[2vw] border-t border-line pt-8 leading-none">
          <LogoMark className="mb-[1.4vw] h-[5vw] text-fog-50" />
          <span className="translate-y-[16%] text-[clamp(4rem,21vw,21rem)] font-semibold leading-[0.8] tracking-[-0.075em] text-fog-50">
            MOV<span className="accent-serif font-normal text-flux">e</span>RA
          </span>
        </div>
      </div>

      <div className="relative border-t border-line bg-ink-950">
        <div className="container-x flex flex-col gap-4 py-6 text-sm text-fog-500 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {siteConfig.name}. {t.footer.rights}
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {legalNav.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-fog-50">
                  {t.footer[l.key]}
                </Link>
              </li>
            ))}
            <li>
              <BackToTop label={t.footer.backToTop} />
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="eyebrow mb-5">{title}</h2>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="group inline-flex items-center gap-1.5 text-fog-200 transition-colors hover:text-fog-50">
        <span className="h-px w-0 bg-flux transition-all duration-500 ease-(--ease-out-expo) group-hover:w-3" aria-hidden="true" />
        {children}
      </Link>
    </li>
  );
}
