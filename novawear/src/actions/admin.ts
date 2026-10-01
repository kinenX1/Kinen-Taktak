"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { imageRules, orderStatusInfo } from "@/config/shop";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/auth/dal";
import { safeDimension, validateImage } from "@/lib/images";
import { slugify } from "@/lib/utils";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";
import { orderStatusSchema, productInput, productSchema } from "@/lib/validation/shop";

// Every action re-checks the admin role on the server.

function refreshStore(slug?: string) {
  revalidatePath("/", "layout");
  if (slug) revalidatePath(`/shop/${slug}`);
}

async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db.product.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function saveProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData);
  const id = typeof formData.get("id") === "string" && formData.get("id") ? String(formData.get("id")) : null;

  const parsed = productSchema.safeParse(productInput(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values, message: "Please fix the highlighted fields." };
  }
  const { colors, preorderNote, details, ...data } = parsed.data;
  const fields = { ...data, details: details ?? "", preorderNote: preorderNote ?? null };
  const colorRows = colors.map((c, position) => ({ ...c, position }));

  if (id) {
    const existing = await db.product.findUnique({ where: { id }, select: { slug: true, name: true } });
    if (!existing) return { message: "This product no longer exists." };
    const slug = existing.name === data.name ? existing.slug : await uniqueSlug(data.name, id);
    await db.$transaction([
      db.productColor.deleteMany({ where: { productId: id } }),
      db.product.update({ where: { id }, data: { ...fields, slug, colors: { create: colorRows } } }),
    ]);
    refreshStore(existing.slug);
    refreshStore(slug);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Saved. The shop is up to date." };
  }

  const product = await db.product.create({
    data: { ...fields, slug: await uniqueSlug(data.name), colors: { create: colorRows } },
    select: { id: true },
  });
  refreshStore();
  revalidatePath("/admin", "layout");
  redirect(`/admin/products/${product.id}?created=1`);
}

export async function deleteProductAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const product = await db.product.findUnique({ where: { id }, select: { slug: true } });
  if (product) {
    // Order lines keep their snapshot; only the link to the product is cleared.
    await db.$transaction([
      db.orderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
      db.product.delete({ where: { id } }),
    ]);
    refreshStore(product.slug);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/products?deleted=1");
}

export async function toggleProductFlagAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const flag = formData.get("flag");
  if (flag !== "published" && flag !== "featured") return;
  const product = await db.product.findUnique({ where: { id }, select: { slug: true, published: true, featured: true } });
  if (!product) return;
  await db.product.update({ where: { id }, data: { [flag]: !product[flag] } });
  refreshStore(product.slug);
  revalidatePath("/admin", "layout");
}

export type UploadResult = { ok: true; id: string } | { ok: false; error: string };

/** Receives one photo at a time (already resized in the browser). */
export async function uploadProductImageAction(formData: FormData): Promise<UploadResult> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { slug: true, name: true, _count: { select: { images: true } } },
  });
  if (!product) return { ok: false, error: "This product no longer exists." };
  if (product._count.images >= imageRules.maxPerProduct) {
    return { ok: false, error: `A product can have up to ${imageRules.maxPerProduct} photos.` };
  }

  const image = await validateImage(formData.get("file"));
  if ("error" in image) return { ok: false, error: image.error };

  const last = await db.productImage.findFirst({ where: { productId }, orderBy: { position: "desc" }, select: { position: true } });
  const created = await db.productImage.create({
    data: {
      productId,
      data: new Uint8Array(image.buffer),
      mimeType: image.mimeType,
      width: safeDimension(formData.get("width")),
      height: safeDimension(formData.get("height")),
      alt: product.name,
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true },
  });
  refreshStore(product.slug);
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, id: created.id };
}

export async function deleteProductImageAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("imageId") ?? "");
  const image = await db.productImage.findUnique({ where: { id }, select: { productId: true, product: { select: { slug: true } } } });
  if (!image) return;
  await db.productImage.delete({ where: { id } });
  refreshStore(image.product.slug);
  revalidatePath(`/admin/products/${image.productId}`);
}

/** Moves a photo to the first position so it becomes the cover. */
export async function makeCoverImageAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("imageId") ?? "");
  const image = await db.productImage.findUnique({ where: { id }, select: { productId: true, product: { select: { slug: true } } } });
  if (!image) return;
  const all = await db.productImage.findMany({ where: { productId: image.productId }, select: { id: true }, orderBy: { position: "asc" } });
  const ordered = [id, ...all.map((i) => i.id).filter((x) => x !== id)];
  await db.$transaction(ordered.map((imageId, position) => db.productImage.update({ where: { id: imageId }, data: { position } })));
  refreshStore(image.product.slug);
  revalidatePath(`/admin/products/${image.productId}`);
}

export async function updateOrderStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = orderStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { orderId, status, note } = parsed.data;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, reference: true, email: true, fullName: true },
  });
  if (!order) return { message: "Order not found." };
  if (order.status === status && !note) return { message: "Nothing changed." };

  await db.$transaction([
    db.order.update({ where: { id: orderId }, data: { status } }),
    db.orderEvent.create({ data: { orderId, status, note: note ?? null } }),
  ]);

  if (formData.get("notify") === "on") {
    await sendEmail({
      to: order.email,
      subject: `NovaWear order ${order.reference}: ${orderStatusInfo[status].label}`,
      text: `Hi ${order.fullName},\n\n${orderStatusInfo[status].description}${note ? `\n\n${note}` : ""}\n\nFollow your order: ${siteConfig.url}/account/orders/${order.reference}\n\n— NovaWear`,
    });
  }

  revalidatePath(`/admin/orders/${order.reference}`);
  revalidatePath("/admin", "layout");
  revalidatePath(`/account/orders/${order.reference}`);
  return { ok: true, message: `Status set to ${orderStatusInfo[status].label}.` };
}
