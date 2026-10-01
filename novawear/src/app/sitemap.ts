import type { MetadataRoute } from "next";
import { categories } from "@/config/shop";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const pages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    ...categories.map((c) => ({ url: `${base}/shop?category=${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
  try {
    const products = await db.product.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } });
    return [...pages, ...products.map((p) => ({ url: `${base}/shop/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 }))];
  } catch {
    // Database unavailable at build time — ship the static pages only.
    return pages;
  }
}
