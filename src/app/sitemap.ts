import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getPublishedProjects } from "@/lib/data/content";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const pages = ["", "/work", "/services", "/about", "/contact", "/start-project", "/privacy", "/terms"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" || path === "/work" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "" ? 1 : path === "/start-project" ? 0.9 : 0.7,
  }));
  let projects: MetadataRoute.Sitemap = [];
  try {
    projects = (await getPublishedProjects()).map((p) => ({
      url: `${base}/work/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly",
      priority: 0.6,
    }));
  } catch {
    // Database unavailable — ship the static pages only.
  }
  return [...pages, ...projects];
}
