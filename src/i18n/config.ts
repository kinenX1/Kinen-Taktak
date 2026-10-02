export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Remembers the visitor's language choice. Not sensitive. */
export const LOCALE_COOKIE = "movera_locale";

export const localeNames: Record<Locale, string> = { en: "English", fr: "Français" };

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

/** BCP 47 tag used for dates and numbers. */
export const intlLocale = (locale: Locale) => (locale === "fr" ? "fr-FR" : "en-GB");

/** Picks the first supported language from an Accept-Language header. */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.map((r) => r.lang).find(isLocale) ?? defaultLocale;
}

/** Replaces `{name}` placeholders in a dictionary string. */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}
