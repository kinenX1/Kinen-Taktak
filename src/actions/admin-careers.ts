"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { CONTENT_TAG } from "@/lib/data/content";
import { deleteStoredFile } from "@/lib/uploads";
import { applicationUpdateSchema, openingSchema } from "@/lib/validation/admin";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";

export async function updateApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = applicationUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, status, adminNotes } = parsed.data;
  await db.jobApplication.update({ where: { id }, data: { status, adminNotes: adminNotes ?? null } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Application updated." };
}

/** Permanently removes an application and its CV (e.g. on the candidate's request). */
export async function deleteApplicationAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const application = await db.jobApplication.findUnique({ where: { id }, select: { cvBlobId: true } });
  if (application) {
    await db.jobApplication.delete({ where: { id } });
    if (application.cvBlobId) await deleteStoredFile(application.cvBlobId);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/careers?deleted=1");
}

export async function saveOpeningAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData);
  const parsed = openingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values, message: "Please fix the highlighted fields." };
  const { id, published, ...rest } = parsed.data;
  const data = { ...rest, published: !!published };
  try {
    if (id) await db.jobOpening.update({ where: { id }, data });
    else await db.jobOpening.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { fieldErrors: { slug: ["Another opening already uses this slug."] }, values };
    }
    throw error;
  }
  updateTag(CONTENT_TAG);
  revalidatePath("/", "layout");
  redirect("/admin/careers?tab=openings&saved=1");
}

export async function deleteOpeningAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.jobOpening.delete({ where: { id } }).catch(() => {});
  updateTag(CONTENT_TAG);
  revalidatePath("/", "layout");
  redirect("/admin/careers?tab=openings&deleted=1");
}
