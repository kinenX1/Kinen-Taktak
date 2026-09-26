import "server-only";
import type { PortfolioCategory } from "@prisma/client";
import { db } from "@/lib/db";

/** Public marketing content. Only published rows are ever returned. */

export function getPublishedProjects(category?: PortfolioCategory | null) {
  return db.portfolioProject.findMany({
    where: { published: true, ...(category ? { category } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export function getFeaturedProjects(limit = 4) {
  return db.portfolioProject.findMany({
    where: { published: true, featured: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export function getProjectBySlug(slug: string) {
  return db.portfolioProject.findFirst({ where: { slug, published: true } });
}

export async function getAdjacentProject(slug: string) {
  const all = await db.portfolioProject.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { slug: true, title: true, category: true, accent: true },
  });
  const i = all.findIndex((p) => p.slug === slug);
  return all.length > 1 ? all[(i + 1) % all.length]! : null;
}

export function getPublishedServices() {
  return db.service.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
}

export type PortfolioItem = Awaited<ReturnType<typeof getPublishedProjects>>[number];
export type ServiceItem = Awaited<ReturnType<typeof getPublishedServices>>[number];
