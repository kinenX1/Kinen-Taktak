import { z } from "zod";

/** Shape returned by every form server action. */
export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echo of submitted text values so forms keep input after a failed submit. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Must be ${max} characters or fewer.` })
    .optional()
    .transform((v) => (v ? v : undefined));

export const requiredText = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, { error: min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.` })
    .max(max, { error: `${label} must be ${max} characters or fewer.` });

export const emailField = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }).max(254));

export const passwordField = z
  .string({ error: "Password is required." })
  .min(10, { error: "Use at least 10 characters." })
  .max(128, { error: "Use 128 characters or fewer." });

/** Converts FormData into a plain object of strings (files are skipped). */
export function formValues(formData: FormData, omit: string[] = []) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$") || omit.includes(key)) continue;
    values[key] = value;
  }
  return values;
}

export function fieldErrorsOf(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}
