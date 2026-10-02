import type { Locale } from "../config";
import { en, type Dictionary } from "./en";
import { fr } from "./fr";

export const dictionaries: Record<Locale, Dictionary> = { en, fr };
export type { Dictionary };
