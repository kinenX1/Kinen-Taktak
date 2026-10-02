import { z } from "zod";
import type { Dictionary } from "@/i18n/dictionaries";
import { experienceLevels } from "@/config/careers";
import { fmt } from "@/i18n/config";

/** Optional profile link → normalised https URL, or undefined. */
const link = (t: Dictionary) =>
  z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        const url = new URL(withProtocol);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) throw new Error();
        return url.toString();
      } catch {
        ctx.addIssue({ code: "custom", message: t.validation.url });
        return z.NEVER;
      }
    });

/** Built per request so every message is in the applicant's language. */
export function applicationSchema(t: Dictionary) {
  const v = t.validation;
  const text = (min: number, max: number) =>
    z
      .string({ error: v.required })
      .trim()
      .min(1, { error: v.required })
      .min(min, { error: fmt(v.min, { min }) })
      .max(max, { error: fmt(v.max, { max }) });
  const optional = (max: number) =>
    z
      .string()
      .trim()
      .max(max, { error: fmt(v.max, { max }) })
      .optional()
      .transform((x) => x || undefined);

  return z.object({
    role: z.string().trim().min(1, { error: v.choose }).max(80),
    fullName: text(2, 100),
    email: z.string({ error: v.required }).trim().toLowerCase().pipe(z.email({ error: v.email }).max(254)),
    phone: optional(40),
    country: optional(80),
    city: optional(80),
    yearsExperience: z.enum(experienceLevels).optional().catch(undefined),
    skills: optional(400),
    languages: optional(200),
    workMode: z.enum(["REMOTE", "HYBRID", "ON_SITE"]).optional().catch(undefined),
    availability: optional(120),
    expectedSalary: optional(120),
    linkedin: link(t),
    portfolio: link(t),
    github: link(t),
    motivation: z
      .string({ error: v.required })
      .trim()
      .min(1, { error: v.required })
      .min(50, { error: t.careers.form.motivationShort })
      .max(5000, { error: fmt(v.max, { max: 5000 }) }),
    consent: z.literal("on", { error: t.careers.form.consentRequired }),
  });
}
