import "server-only";
import type { Category, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Fields needed to draw a product card. Image bytes are never selected here. */
export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  category: true,
  price: true,
  availability: true,
  preorderNote: true,
  sizes: true,
  featured: true,
  colors: { select: { name: true, hex: true }, orderBy: { position: "asc" } },
  images: {
    select: { id: true, width: true, height: true, alt: true },
    orderBy: { position: "asc" },
    take: 2,
  },
} satisfies Prisma.ProductSelect;

export type ProductCardData = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

const order: Prisma.ProductOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { createdAt: "desc" }];

export function getShopProducts({ category, q }: { category?: Category; q?: string } = {}) {
  return db.product.findMany({
    where: {
      published: true,
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    },
    select: productCardSelect,
    orderBy: order,
  });
}

export async function getFeaturedProducts(limit = 8) {
  const featured = await db.product.findMany({
    where: { published: true, featured: true },
    select: productCardSelect,
    orderBy: order,
    take: limit,
  });
  if (featured.length >= 4) return featured;
  // Top up with the newest pieces so the home page never looks empty.
  const more = await db.product.findMany({
    where: { published: true, id: { notIn: featured.map((p) => p.id) } },
    select: productCardSelect,
    orderBy: order,
    take: limit - featured.length,
  });
  return [...featured, ...more];
}

export async function getCategoryCounts() {
  const rows = await db.product.groupBy({ by: ["category"], where: { published: true }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.category, r._count._all])) as Partial<Record<Category, number>>;
}

export function getProductBySlug(slug: string) {
  return db.product.findFirst({
    where: { slug, published: true },
    select: {
      ...productCardSelect,
      description: true,
      details: true,
      images: { select: { id: true, width: true, height: true, alt: true }, orderBy: { position: "asc" } },
    },
  });
}

/** Same category first, then other pieces to complete the look. */
export async function getRelatedProducts(category: Category, excludeId: string, limit = 4) {
  const same = await db.product.findMany({
    where: { published: true, category, id: { not: excludeId } },
    select: productCardSelect,
    orderBy: order,
    take: limit,
  });
  if (same.length >= limit) return same;
  const others = await db.product.findMany({
    where: { published: true, category: { not: category } },
    select: productCardSelect,
    orderBy: order,
    take: limit - same.length,
  });
  return [...same, ...others];
}
