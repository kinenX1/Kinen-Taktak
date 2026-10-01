import { z } from "zod";
import { availabilityValues, cartRules, categoryValues, orderStatusValues, sizeOptions } from "@/config/shop";
import { emailField, optionalText, requiredText } from "./common";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: "Use a hex colour like #151514." })
  .transform((v) => v.toUpperCase());

export const colorSchema = z.object({
  name: requiredText("Colour name", 1, 30),
  hex: hexColor,
});

/** Accepts "45", "45.9", "45,90" and converts to minor units. */
const priceField = z
  .string({ error: "Price is required." })
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,2})?$/, { error: "Enter a price like 45 or 45.90." })
  .transform((v) => Math.round(parseFloat(v.replace(",", ".")) * 100))
  .refine((v) => v > 0, { error: "Price must be more than zero." });

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true");

export const productSchema = z.object({
  name: requiredText("Name", 2, 80),
  description: requiredText("Description", 10, 2000),
  details: optionalText(2000),
  category: z.enum(categoryValues, { error: "Choose a category." }),
  price: priceField,
  availability: z.enum(availabilityValues, { error: "Choose availability." }),
  preorderNote: optionalText(120),
  sizes: z
    .array(z.enum(sizeOptions))
    .min(1, { error: "Pick at least one size." })
    .transform((sizes) => sizeOptions.filter((s) => sizes.includes(s))),
  colors: z
    .array(colorSchema)
    .min(1, { error: "Add at least one colour." })
    .max(12, { error: "Use 12 colours or fewer." }),
  published: checkbox,
  featured: checkbox,
  sortOrder: z.coerce.number().int().min(0).max(9999).catch(0),
});

/** Reads the product form, including multi-value and JSON fields. */
export function productInput(formData: FormData) {
  let colors: unknown = [];
  try {
    colors = JSON.parse(String(formData.get("colors") ?? "[]"));
  } catch {
    colors = [];
  }
  return {
    name: formData.get("name") ?? undefined,
    description: formData.get("description") ?? undefined,
    details: formData.get("details") ?? undefined,
    category: formData.get("category") ?? undefined,
    price: formData.get("price") ?? undefined,
    availability: formData.get("availability") ?? undefined,
    preorderNote: formData.get("preorderNote") ?? undefined,
    sizes: formData.getAll("sizes").map(String),
    colors,
    published: formData.get("published"),
    featured: formData.get("featured"),
    sortOrder: formData.get("sortOrder") ?? 0,
  };
}

export const cartLineSchema = z.object({
  productId: z.string().min(1).max(40),
  colorName: z.string().trim().min(1).max(30),
  size: z.string().trim().min(1).max(12),
  quantity: z.coerce.number().int().min(1).max(cartRules.maxQuantity),
});

export const checkoutSchema = z.object({
  fullName: requiredText("Full name", 2, 80),
  phone: z
    .string({ error: "Phone is required." })
    .trim()
    .min(6, { error: "Enter a phone number we can reach you on." })
    .max(40)
    .regex(/^[+()\d\s.-]+$/, { error: "Use digits, spaces and + only." }),
  email: emailField,
  address: requiredText("Address", 5, 200),
  city: requiredText("City", 2, 80),
  postalCode: optionalText(20),
  note: optionalText(500),
  items: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Your bag could not be read." });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(cartLineSchema)
        .min(1, { error: "Your bag is empty." })
        .max(cartRules.maxLines, { error: "Too many different items in one order." }),
    ),
});

export const orderStatusSchema = z.object({
  orderId: z.string().min(1).max(40),
  status: z.enum(orderStatusValues),
  note: optionalText(500),
});

export const subscribeSchema = z.object({ email: emailField });
