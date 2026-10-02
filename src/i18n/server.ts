import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from "./config";
import { dictionaries } from "./dictionaries";

/** The visitor's language: their saved choice, else their browser language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return negotiateLocale((await headers()).get("accept-language"));
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}

export const getDictionary = (locale: Locale) => dictionaries[locale];
