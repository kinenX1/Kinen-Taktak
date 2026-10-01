import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { orderSelect } from "./orders";

// Admin-only queries. Callers must have passed requireAdmin().

export async function getAdminStats() {
  const [products, published, openOrders, openPreorders, customers, subscribers] = await Promise.all([
    db.product.count(),
    db.product.count({ where: { published: true } }),
    db.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "SHIPPED"] } } }),
    db.order.count({ where: { hasPreorder: true, status: { in: ["PENDING", "CONFIRMED"] } } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.subscriber.count(),
  ]);
  return { products, published, openOrders, openPreorders, customers, subscribers };
}

export function getPendingOrderCount() {
  return db.order.count({ where: { status: "PENDING" } });
}

export function getAdminProducts() {
  return db.product.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      price: true,
      availability: true,
      published: true,
      featured: true,
      sizes: true,
      colors: { select: { name: true, hex: true }, orderBy: { position: "asc" } },
      images: { select: { id: true }, orderBy: { position: "asc" }, take: 1 },
      _count: { select: { images: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export function getAdminProduct(id: string) {
  return db.product.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      details: true,
      category: true,
      price: true,
      availability: true,
      preorderNote: true,
      sizes: true,
      published: true,
      featured: true,
      sortOrder: true,
      colors: { select: { name: true, hex: true }, orderBy: { position: "asc" } },
      images: { select: { id: true, width: true, height: true, position: true }, orderBy: { position: "asc" } },
    },
  });
}

export type AdminOrderFilter = { status?: OrderStatus; preorder?: boolean; q?: string };

export function getAdminOrders({ status, preorder, q }: AdminOrderFilter = {}) {
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(preorder ? { hasPreorder: true } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  return db.order.findMany({
    where,
    select: {
      id: true,
      reference: true,
      status: true,
      fullName: true,
      city: true,
      total: true,
      hasPreorder: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export function getRecentOrders(take = 6) {
  return db.order.findMany({
    select: { id: true, reference: true, status: true, fullName: true, total: true, hasPreorder: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function getAdminOrder(reference: string) {
  return db.order.findUnique({
    where: { reference },
    select: { ...orderSelect, user: { select: { id: true, name: true, email: true, phone: true } } },
  });
}

export function getCustomers() {
  return db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export function getSubscribers() {
  return db.subscriber.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
}
