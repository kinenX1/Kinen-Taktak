import { getFeaturedProjects, getPublishedServices } from "@/lib/data/content";
import { Hero } from "@/components/home/hero";
import { CapabilityMarquee } from "@/components/home/capability-marquee";
import { ServicesSection } from "@/components/home/services-section";
import { WorkSection } from "@/components/home/work-section";
import { ProcessSection } from "@/components/home/process-section";
import { AboutSection } from "@/components/home/about-section";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd, organizationJsonLd } from "@/components/seo/json-ld";

// Content is managed in /admin; admin saves revalidate immediately.
export const revalidate = 3600;

export default async function HomePage() {
  const [services, projects] = await Promise.all([getPublishedServices(), getFeaturedProjects(4)]);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <Hero />
      <CapabilityMarquee />
      <ServicesSection
        services={services.map(({ slug, shortTitle, tagline, capabilities }) => ({ slug, shortTitle, tagline, capabilities }))}
      />
      {projects.length > 0 && <WorkSection projects={projects} />}
      <ProcessSection />
      <AboutSection />
      <FinalCta />
    </>
  );
}
