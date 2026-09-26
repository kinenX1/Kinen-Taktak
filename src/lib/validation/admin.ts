import { z } from "zod";
import { optionalText, requiredText } from "./common";

const statuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CONTACTED",
  "PROPOSAL",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export const statusChangeSchema = z.object({
  requestId: z.string().min(1).max(40),
  status: z.enum(statuses, { error: "Choose a status." }),
  note: optionalText(4000),
  notifyClient: z.literal("on").optional(),
});

export const noteSchema = z.object({
  requestId: z.string().min(1).max(40),
  body: requiredText("Note", 1, 4000),
  visibility: z.enum(["CLIENT", "INTERNAL"]),
});

/** Textarea with one entry per line → string[] */
export const lines = (max = 20) =>
  z
    .string()
    .max(5000)
    .optional()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max),
    );

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: "Use a 6-digit hex colour like #FF5A1F." });

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Use lowercase letters, numbers and dashes." })
  .max(80);

const imagePath = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), {
    error: "Use a site path like /images/cover.jpg or an https:// URL.",
  })
  .optional()
  .transform((v) => (v ? v : null));

export const portfolioSchema = z.object({
  id: z.string().max(40).optional(),
  slug,
  title: requiredText("Title", 2, 120),
  category: z.enum(["WEBSITE", "APP", "WEB_APP", "ECOMMERCE", "SOFTWARE", "UI_UX"]),
  client: requiredText("Client label", 2, 120),
  year: z.coerce.number().int().min(2000).max(2100),
  summary: requiredText("Summary", 10, 400),
  overview: requiredText("Overview", 10, 4000),
  challenge: requiredText("Challenge", 10, 4000),
  solution: requiredText("Solution", 10, 4000),
  design: requiredText("Design", 10, 4000),
  development: requiredText("Development", 10, 4000),
  results: lines(),
  technologies: lines(),
  gallery: lines(12),
  accent: hex,
  visualVariant: z.enum(["BROWSER", "PHONE", "DASHBOARD", "COMMERCE", "SYSTEM"]),
  coverImage: imagePath,
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\//.test(v), { error: "Use an https:// URL." })
    .optional()
    .transform((v) => (v ? v : null)),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  featured: z.literal("on").optional(),
  published: z.literal("on").optional(),
  isDemo: z.literal("on").optional(),
});

export const serviceSchema = z.object({
  id: z.string().min(1).max(40),
  title: requiredText("Title", 2, 120),
  shortTitle: requiredText("Short title", 2, 60),
  tagline: requiredText("Tagline", 5, 200),
  description: requiredText("Description", 10, 3000),
  audience: requiredText("Audience", 10, 2000),
  capabilities: lines(),
  benefits: lines(),
  technologies: lines(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  published: z.literal("on").optional(),
});

export const messageStatusSchema = z.object({
  id: z.string().min(1).max(40),
  status: z.enum(["NEW", "READ", "ARCHIVED"]),
});

export const roleSchema = z.object({
  userId: z.string().min(1).max(40),
  role: z.enum(["CLIENT", "ADMIN"]),
});
