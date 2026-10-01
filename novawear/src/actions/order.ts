"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { deliveryFee, formatPrice } from "@/config/shop";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { adminNotificationEmail, sendEmail } from "@/lib/email";
import { getCurrentUser } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/rate-limit";
import { generateReference } from "@/lib/reference";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";
import { checkoutSchema, subscribeSchema } from "@/lib/validation/shop";

/**
 * Places an order from the bag. Prices, colours, sizes and availability are
 * re-read from the database; the browser only says what and how many.
 */
export async function placeOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout");

  const values = formValues(formData, ["items"]);
  const limited = await rateLimit("order", 20, 60 * 60 * 1000);
  if (!limited.ok) return { message: "Too many orders in a short time. Please try again later.", values };

  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors = fieldErrorsOf(parsed.error);
    return { fieldErrors: errors, values, message: errors.items?.[0] };
  }
  const { items, ...delivery } = parsed.data;

  const products = await db.product.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productId))] }, published: true },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      price: true,
      availability: true,
      sizes: true,
      colors: { select: { name: true, hex: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: Prisma.OrderItemCreateWithoutOrderInput[] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) return { message: "Something in your bag is no longer available. Please review your bag.", values };
    if (product.availability === "SOLD_OUT") return { message: `${product.name} just sold out. Please remove it from your bag.`, values };
    const color = product.colors.find((c) => c.name === item.colorName);
    if (!color || !product.sizes.includes(item.size)) {
      return { message: `${product.name} changed. Please remove it and add it again.`, values };
    }
    lines.push({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      colorName: color.name,
      colorHex: color.hex,
      size: item.size,
      unitPrice: product.price,
      quantity: item.quantity,
      preorder: product.availability === "PRE_ORDER",
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const total = subtotal + (deliveryFee ?? 0);
  const hasPreorder = lines.some((l) => l.preorder);

  let reference = "";
  for (let attempt = 0; attempt < 5 && !reference; attempt++) {
    const candidate = generateReference();
    try {
      await db.order.create({
        data: {
          reference: candidate,
          userId: user.id,
          ...delivery,
          postalCode: delivery.postalCode ?? null,
          note: delivery.note ?? null,
          subtotal,
          deliveryFee,
          total,
          hasPreorder,
          items: { create: lines },
          events: { create: { status: "PENDING" } },
        },
      });
      reference = candidate;
    } catch (error) {
      const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!duplicate) throw error;
    }
  }
  if (!reference) return { message: "We couldn't place your order. Please try again.", values };

  // Remember the phone number for next time.
  if (!user.phone) await db.user.update({ where: { id: user.id }, data: { phone: delivery.phone } });

  const summary = lines
    .map((l) => `• ${l.name} — ${l.colorName}, ${l.size} × ${l.quantity}${l.preorder ? " (pre-order)" : ""}`)
    .join("\n");
  const link = `${siteConfig.url}/account/orders/${reference}`;
  await sendEmail({
    to: delivery.email,
    subject: `NovaWear order ${reference} received`,
    text: `Hi ${delivery.fullName},\n\nThanks for your order. We'll call or message you on ${delivery.phone} to confirm it.\n\n${summary}\n\nTotal: ${formatPrice(total)}${deliveryFee === null ? " + delivery (confirmed with you)" : ""}\nPayment: cash on delivery\n\nFollow your order: ${link}\n\n— NovaWear`,
  });
  const adminEmail = adminNotificationEmail();
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New ${hasPreorder ? "pre-order" : "order"} ${reference} — ${delivery.fullName}`,
      text: `${delivery.fullName} · ${delivery.phone} · ${delivery.city}\n\n${summary}\n\nTotal: ${formatPrice(total)}\n\n${siteConfig.url}/admin/orders/${reference}`,
    });
  }

  revalidatePath("/admin", "layout");
  redirect(`/account/orders/${reference}?placed=1`);
}

export async function subscribeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const limited = await rateLimit("subscribe", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: "Too many attempts. Please try again later." };
  // Honeypot: real visitors never fill this hidden field.
  if (formData.get("company")) return { ok: true, message: "You're in the pack." };

  const parsed = subscribeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values: formValues(formData) };

  await db.subscriber.upsert({ where: { email: parsed.data.email }, create: { email: parsed.data.email }, update: {} });
  return { ok: true, message: "You're in the pack. First call on every drop." };
}
