import type { Locale } from "@/i18n/config";
import { portfolioSeeds } from "@/content/portfolio";
import { serviceSeeds } from "@/content/services";
import { openingSeeds } from "@/content/careers";
import { portfolioFr } from "@/content/fr/portfolio";
import { servicesFr } from "@/content/fr/services";
import { openingsFr } from "@/content/fr/careers";

/**
 * Seeded marketing content is stored in English. For French visitors each
 * field is swapped for its translation — but only while the stored value is
 * still the original seed text, so anything rewritten in /admin is shown
 * exactly as the team entered it.
 */
function translate<T extends { slug: string }, S extends { slug: string }>(
  row: T,
  locale: Locale,
  seeds: S[],
  translations: Record<string, Partial<Record<string, unknown>>>,
): T {
  if (locale === "en") return row;
  const seed = seeds.find((s) => s.slug === row.slug) as Record<string, unknown> | undefined;
  const fr = translations[row.slug];
  if (!seed || !fr) return row;
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(fr)) {
    if (JSON.stringify(out[key]) === JSON.stringify(seed[key])) out[key] = value;
  }
  return out as T;
}

export const localizeProject = <T extends { slug: string }>(row: T, locale: Locale) =>
  translate(row, locale, portfolioSeeds, portfolioFr);

export const localizeService = <T extends { slug: string }>(row: T, locale: Locale) =>
  translate(row, locale, serviceSeeds, servicesFr);

export const localizeOpening = <T extends { slug: string }>(row: T, locale: Locale) =>
  translate(row, locale, openingSeeds, openingsFr);
