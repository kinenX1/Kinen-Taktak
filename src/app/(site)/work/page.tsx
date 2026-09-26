import type { Metadata } from "next";
import { getPublishedProjects } from "@/lib/data/content";
import { PageHero } from "@/components/layout/page-hero";
import { FinalCta } from "@/components/home/final-cta";
import { WorkFilterFromUrl } from "@/components/work/work-filter-from-url";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected MovEra projects — websites, mobile apps, web applications, e-commerce, software and UI/UX design.",
  alternates: { canonical: "/work" },
  openGraph: { url: "/work", title: "Work — MovEra" },
};

export default async function WorkPage() {
  const projects = await getPublishedProjects();
  return (
    <>
      <PageHero
        label="Work"
        title={["Work that", { text: "moves.", className: "accent-serif text-flux" }]}
        intro="Concept projects across industries and platforms — each one a study in clear thinking, careful design and solid engineering."
      />
      <WorkFilterFromUrl projects={projects} />
      <FinalCta title={["Your project", "could be next."]} />
    </>
  );
}
