import type { Metadata } from "next";
import { getPublishedProjects } from "@/lib/data/content";
import { getI18n } from "@/i18n/server";
import { PageHero } from "@/components/layout/page-hero";
import { FinalCta } from "@/components/home/final-cta";
import { WorkFilterFromUrl } from "@/components/work/work-filter-from-url";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.work.title,
    description: t.meta.work.description,
    alternates: { canonical: "/work" },
    openGraph: { url: "/work", title: `${t.meta.work.title} — MovEra` },
  };
}

export default async function WorkPage() {
  const { locale, t } = await getI18n();
  const projects = await getPublishedProjects(locale);
  return (
    <>
      <PageHero label={t.work.label} title={[t.work.title1, { text: t.work.title2, className: "accent-serif text-flux" }]} intro={t.work.intro} />
      <WorkFilterFromUrl projects={projects} />
      <FinalCta title={[t.work.ctaTitle1, t.work.ctaTitle2]} />
    </>
  );
}
