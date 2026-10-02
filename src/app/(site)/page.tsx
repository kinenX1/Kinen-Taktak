import { getFeaturedProjects, getPublishedServices } from "@/lib/data/content";
import { getI18n } from "@/i18n/server";
import { Hero } from "@/components/home/hero";
import { CapabilityMarquee } from "@/components/home/capability-marquee";
import { ServicesSection } from "@/components/home/services-section";
import { WorkSection } from "@/components/home/work-section";
import { ProcessSection } from "@/components/home/process-section";
import { AboutSection } from "@/components/home/about-section";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd, organizationJsonLd } from "@/components/seo/json-ld";

export default async function HomePage() {
  const { locale, t } = await getI18n();
  const [services, projects] = await Promise.all([getPublishedServices(locale), getFeaturedProjects(locale, 4)]);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <Hero />
      <CapabilityMarquee label={t.home.capabilitiesLabel} items={t.home.capabilities} />
      <ServicesSection
        services={services.map(({ slug, shortTitle, tagline, capabilities }) => ({ slug, shortTitle, tagline, capabilities }))}
      />
      {projects.length > 0 && <WorkSection projects={projects} t={t.home.work} />}
      <ProcessSection />
      <AboutSection t={t.home.about} pillars={t.company.pillars} />
      <FinalCta />
    </>
  );
}
