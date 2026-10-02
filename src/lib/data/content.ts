import "server-only";
import { unstable_cache } from "next/cache";
import type { PortfolioCategory, PortfolioProject, Service, JobOpening } from "@prisma/client";
import { db } from "@/lib/db";
import type { Locale } from "@/i18n/config";
import { localizeOpening, localizeProject, localizeService } from "./localize";

/**
 * Public marketing content. Only published rows are ever returned.
 * Queries are cached across requests (tag "content") and refreshed by the
 * admin actions that edit them, so public pages stay fast while rendering
 * per-request for the visitor's language.
 */
export const CONTENT_TAG = "content";

type Dated = { createdAt: Date; updatedAt: Date };
/** The cache serialises results to JSON, so timestamps are dropped. */
function undated<T extends Dated>(row: T): Omit<T, keyof Dated> {
  const copy: Partial<T> = { ...row };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy as Omit<T, keyof Dated>;
}

const cached = <A extends unknown[], R>(key: string, fn: (...args: A) => Promise<R>) =>
  unstable_cache(fn, [key], { tags: [CONTENT_TAG], revalidate: 3600 });

const allProjects = cached("projects", async () =>
  (
    await db.portfolioProject.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    })
  ).map(undated),
);

const allServices = cached("services", async () =>
  (await db.service.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } })).map(undated),
);

const allOpenings = cached("openings", async () =>
  (
    await db.jobOpening.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    })
  ).map(undated),
);

export type PortfolioItem = Omit<PortfolioProject, keyof Dated>;
export type ServiceItem = Omit<Service, keyof Dated>;
export type OpeningItem = Omit<JobOpening, keyof Dated>;

export async function getPublishedProjects(locale: Locale, category?: PortfolioCategory | null): Promise<PortfolioItem[]> {
  const rows = await allProjects();
  return rows.filter((p) => !category || p.category === category).map((p) => localizeProject(p, locale));
}

export async function getFeaturedProjects(locale: Locale, limit = 4) {
  return (await getPublishedProjects(locale)).filter((p) => p.featured).slice(0, limit);
}

export async function getProjectBySlug(locale: Locale, slug: string) {
  return (await getPublishedProjects(locale)).find((p) => p.slug === slug) ?? null;
}

export async function getAdjacentProject(locale: Locale, slug: string) {
  const all = await getPublishedProjects(locale);
  const i = all.findIndex((p) => p.slug === slug);
  return all.length > 1 ? all[(i + 1) % all.length]! : null;
}

export async function getPublishedServices(locale: Locale): Promise<ServiceItem[]> {
  return (await allServices()).map((s) => localizeService(s, locale));
}

export async function getPublishedOpenings(locale: Locale): Promise<OpeningItem[]> {
  return (await allOpenings()).map((o) => localizeOpening(o, locale));
}

export async function getOpeningBySlug(locale: Locale, slug: string) {
  return (await getPublishedOpenings(locale)).find((o) => o.slug === slug) ?? null;
}
