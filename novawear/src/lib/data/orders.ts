import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const orderSelect = {
  id: true,
  reference: true,
  status: true,
  fullName: true,
  phone: true,
  email: true,
  address: true,
  city: true,
  postalCode: true,
  note: true,
  paymentMethod: true,
  subtotal: true,
  deliveryFee: true,
  total: true,
  hasPreorder: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      name: true,
      slug: true,
      category: true,
      colorName: true,
      colorHex: true,
      size: true,
      unitPrice: true,
      quantity: true,
      preorder: true,
    },
    orderBy: { id: "asc" },
  },
  events: { select: { id: true, status: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderSelect;

export type OrderData = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

/** Customer queries are always scoped by userId, so other orders return null. */
export function getMyOrders(userId: string) {
  return db.order.findMany({ where: { userId }, select: orderSelect, orderBy: { createdAt: "desc" } });
}

export function getMyOrder(userId: string, reference: string) {
  return db.order.findFirst({ where: { userId, reference }, select: orderSelect });
}

/** Prefills the checkout with the customer's last delivery address. */
export function getLastDelivery(userId: string) {
  return db.order.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { fullName: true, phone: true, address: true, city: true, postalCode: true },
  });
}
