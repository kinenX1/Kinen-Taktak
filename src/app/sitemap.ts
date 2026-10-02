import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getPublishedOpenings, getPublishedProjects } from "@/lib/data/content";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const pages = ["", "/work", "/services", "/about", "/careers", "/contact", "/start-project", "/privacy", "/terms"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" || path === "/work" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "" ? 1 : path === "/start-project" ? 0.9 : 0.7,
  }));
  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const [projects, openings] = await Promise.all([getPublishedProjects("en"), getPublishedOpenings("en")]);
    dynamic = [
      ...projects.map((p) => ({ url: `${base}/work/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
      ...openings.map((o) => ({ url: `${base}/careers/${o.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ];
  } catch {
    // Database unavailable — ship the static pages only.
  }
  return [...pages, ...dynamic];
}
