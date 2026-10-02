import type { z } from "zod";
import { fmt } from "./config";
import type { Dictionary } from "./dictionaries/en";
import { fieldErrorsOf } from "@/lib/validation/common";

/**
 * Validation schemas are written once, in English. This maps their messages
 * to the visitor's language so the same schema serves every locale.
 */
function translateMessage(message: string, t: Dictionary): string {
  const v = t.validation;
  const exact: Record<string, string> = {
    "Enter a valid email address.": v.email,
    "Please accept the terms to continue.": v.terms,
    "Enter your current password.": v.currentPassword,
    "Enter your password to confirm.": v.confirmPassword,
    'Type "DELETE" to confirm.': v.typeDelete,
    "Choose a project type.": v.projectType,
    "Choose a budget range.": v.budget,
    "Choose a timeline.": v.timeline,
    "Tell us what kind of project this is.": v.otherType,
    "Enter your budget.": v.budgetCustom,
    "Add up to 10 links.": v.links,
  };
  if (exact[message]) return exact[message]!;

  let m: RegExpMatchArray | null;
  if ((m = message.match(/^"(.+)" is not a valid link\.$/))) return fmt(v.invalidLink, { value: m[1]! });
  if (/ is required\.$/.test(message)) return v.required;
  if ((m = message.match(/(?:must be|Use) at least (\d+) characters\.$/))) return fmt(v.min, { min: m[1]! });
  if ((m = message.match(/(?:[Mm]ust be|Use) (\d+) characters or fewer\.$/))) return fmt(v.max, { max: m[1]! });
  return message;
}

export function localizeFieldErrors(errors: Record<string, string[] | undefined>, t: Dictionary) {
  const out: Record<string, string[] | undefined> = {};
  for (const [key, list] of Object.entries(errors)) out[key] = list?.map((msg) => translateMessage(msg, t));
  return out;
}

/** `fieldErrorsOf` in the visitor's language. */
export const localizedFieldErrors = (error: z.ZodError, t: Dictionary) => localizeFieldErrors(fieldErrorsOf(error), t);
