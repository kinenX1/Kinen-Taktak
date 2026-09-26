import { z } from "zod";
import { budgetRanges, projectTypes, timelines } from "@/config/project-brief";
import { emailField, optionalText, requiredText } from "./common";

const projectTypeValues = projectTypes.map((t) => t.value) as [string, ...string[]];
const budgetValues = budgetRanges.map((b) => b.value) as unknown as [string, ...string[]];
const timelineValues = timelines.map((t) => t.value) as unknown as [string, ...string[]];

/** Newline/comma separated links → validated list of http(s) URLs. */
export const inspirationField = z
  .string()
  .max(3000)
  .optional()
  .transform((raw, ctx) => {
    const items = (raw ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 10) {
      ctx.addIssue({ code: "custom", message: "Add up to 10 links." });
      return z.NEVER;
    }
    const urls: string[] = [];
    for (const item of items) {
      const withProtocol = /^https?:\/\//i.test(item) ? item : `https://${item}`;
      try {
        const url = new URL(withProtocol);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) throw new Error();
        urls.push(url.toString().slice(0, 500));
      } catch {
        ctx.addIssue({ code: "custom", message: `"${item.slice(0, 60)}" is not a valid link.` });
        return z.NEVER;
      }
    }
    return urls;
  });

const base = {
  // Client information
  contactName: requiredText("Name", 2, 80),
  contactEmail: emailField,
  contactPhone: optionalText(40),
  contactCompany: optionalText(120),
  contactCountry: optionalText(80),
  // Project
  title: requiredText("Project name", 2, 120),
  projectType: z.enum(projectTypeValues, { error: "Choose a project type." }),
  otherType: optionalText(120),
  description: requiredText("Project description", 20, 8000),
  business: optionalText(5000),
  targetUsers: optionalText(3000),
  features: optionalText(8000),
  budget: z.enum(budgetValues, { error: "Choose a budget range." }),
  budgetCustom: optionalText(120),
  timeline: z.enum(timelineValues, { error: "Choose a timeline." }),
  inspiration: inspirationField,
  additionalInfo: optionalText(5000),
};

export const projectRequestSchema = z
  .object(base)
  .superRefine((data, ctx) => {
    if (data.projectType === "OTHER" && !data.otherType) {
      ctx.addIssue({ code: "custom", path: ["otherType"], message: "Tell us what kind of project this is." });
    }
    if (data.budget === "custom" && !data.budgetCustom) {
      ctx.addIssue({ code: "custom", path: ["budgetCustom"], message: "Enter your budget." });
    }
  });

/** Drafts only need enough to be recognisable later. */
export const projectDraftSchema = z.object({
  ...base,
  title: requiredText("Project name", 2, 120),
  contactName: optionalText(80).transform((v) => v ?? ""),
  contactEmail: z.string().trim().max(254).optional().transform((v) => v ?? ""),
  projectType: z.enum(projectTypeValues).optional().catch(undefined),
  description: optionalText(8000).transform((v) => v ?? ""),
  budget: z.enum(budgetValues).optional().catch(undefined),
  timeline: z.enum(timelineValues).optional().catch(undefined),
});

export type ProjectRequestInput = z.infer<typeof projectRequestSchema>;
