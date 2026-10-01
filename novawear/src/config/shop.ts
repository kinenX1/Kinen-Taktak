import type { Availability, Category, OrderStatus } from "@prisma/client";

/**
 * Shop rules: categories, sizes, colour presets, statuses and pricing.
 * Shared by the storefront, the checkout and the admin panel.
 */

export const currency = process.env.NEXT_PUBLIC_CURRENCY || "EUR";

/**
 * Delivery fee in minor units (1/100 of the currency). `null` means the fee
 * is confirmed with the customer when the order is confirmed.
 */
export const deliveryFee: number | null = null;

export type GarmentKind = "tee" | "pants" | "hoodie" | "pyjama" | "shorts" | "jacket";

export const categories: { value: Category; label: string; slug: string; garment: GarmentKind }[] = [
  { value: "TSHIRT", label: "T-Shirts", slug: "t-shirts", garment: "tee" },
  { value: "PANTS", label: "Pants", slug: "pants", garment: "pants" },
  { value: "HOODIE", label: "Hoodies", slug: "hoodies", garment: "hoodie" },
  { value: "PYJAMA", label: "Pyjamas", slug: "pyjamas", garment: "pyjama" },
  { value: "SHORTS", label: "Shorts", slug: "shorts", garment: "shorts" },
  { value: "JACKET", label: "Jackets", slug: "jackets", garment: "jacket" },
];

export const categoryValues = categories.map((c) => c.value) as [Category, ...Category[]];

export function categoryInfo(value: Category) {
  return categories.find((c) => c.value === value) ?? categories[0]!;
}

export function categoryBySlug(slug: string | undefined | null) {
  return categories.find((c) => c.slug === slug) ?? null;
}

export const sizeOptions = ["XS", "S", "M", "L", "XL", "XXL", "One size"] as const;

/** Colour presets offered in the admin. Any other hex can be added too. */
export const colorPresets = [
  { name: "Ink", hex: "#151514" },
  { name: "Bone", hex: "#ECE8DF" },
  { name: "Leopard", hex: "#C9892E" },
  { name: "Olive", hex: "#5D6047" },
  { name: "Chocolate", hex: "#4B3427" },
  { name: "Grey", hex: "#9C9B97" },
  { name: "Sand", hex: "#B9A487" },
  { name: "Navy", hex: "#1F2738" },
];

export const availabilityLabel: Record<Availability, string> = {
  IN_STOCK: "In stock",
  PRE_ORDER: "Pre-order",
  SOLD_OUT: "Sold out",
};

export const availabilityValues = ["IN_STOCK", "PRE_ORDER", "SOLD_OUT"] as const;

export const orderStatusInfo: Record<OrderStatus, { label: string; description: string }> = {
  PENDING: { label: "Received", description: "We have your order and will call or message you to confirm it." },
  CONFIRMED: { label: "Confirmed", description: "Your order is confirmed and being prepared." },
  SHIPPED: { label: "Shipped", description: "Your order is on its way." },
  DELIVERED: { label: "Delivered", description: "Delivered. Welcome to the pack." },
  CANCELLED: { label: "Cancelled", description: "This order was cancelled." },
};

/** The normal path of an order, used for the progress timeline. */
export const orderFlow: OrderStatus[] = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];

export const orderStatusValues = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

export const imageRules = {
  maxPerProduct: 8,
  maxBytes: 3 * 1024 * 1024,
  /** Longest edge after in-browser resizing. */
  maxEdge: 1600,
};

export const cartRules = { maxLines: 30, maxQuantity: 20 };

const formatter = new Intl.NumberFormat("en", { style: "currency", currency });

/** Formats an amount stored in minor units. */
export function formatPrice(minor: number) {
  return formatter.format(minor / 100);
}

/** True for colours light enough to need dark marks on top. */
export function isLightColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.18;
}
