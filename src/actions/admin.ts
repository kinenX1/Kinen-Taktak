"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { labelFor } from "@/config/project-brief";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/auth/dal";
import {
  messageStatusSchema,
  noteSchema,
  portfolioSchema,
  roleSchema,
  serviceSchema,
  statusChangeSchema,
} from "@/lib/validation/admin";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";

// Every action re-checks the admin role on the server.

export async function changeStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = statusChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { requestId, status, note, notifyClient } = parsed.data;

  const request = await db.projectRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, reference: true, title: true, contactEmail: true, contactName: true },
  });
  if (!request) return { message: "Request not found." };
  if (request.status === status && !note) return { message: "Nothing changed." };

  await db.$transaction([
    db.projectRequest.update({ where: { id: requestId }, data: { status } }),
    db.projectUpdate.create({
      data: {
        requestId,
        authorId: admin.id,
        kind: "STATUS_CHANGE",
        visibility: "CLIENT",
        fromStatus: request.status,
        toStatus: status,
        body: note ?? null,
      },
    }),
  ]);

  if (notifyClient) {
    await sendEmail({
      to: request.contactEmail,
      subject: `Update on ${request.reference}: ${labelFor.status(status)}`,
      text: `Hi ${request.contactName},\n\nThe status of "${request.title}" is now ${labelFor.status(status)}.${note ? `\n\n${note}` : ""}\n\nView details: ${siteConfig.url}/dashboard/requests/${request.reference}\n\n— MovEra`,
    });
  }

  revalidatePath(`/admin/requests/${request.reference}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Status set to ${labelFor.status(status)}.` };
}

export async function addNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = formValues(formData);
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const request = await db.projectRequest.findUnique({
    where: { id: parsed.data.requestId },
    select: { reference: true },
  });
  if (!request) return { message: "Request not found." };

  await db.projectUpdate.create({
    data: {
      requestId: parsed.data.requestId,
      authorId: admin.id,
      kind: "NOTE",
      visibility: parsed.data.visibility,
      body: parsed.data.body,
    },
  });
  revalidatePath(`/admin/requests/${request.reference}`);
  revalidatePath(`/dashboard/requests/${request.reference}`);
  return {
    ok: true,
    message: parsed.data.visibility === "INTERNAL" ? "Internal note added." : "Update shared with the client.",
  };
}

export async function savePortfolioProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData);
  const parsed = portfolioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values, message: "Please fix the highlighted fields." };
  }
  const { id, featured, published, isDemo, ...rest } = parsed.data;
  const data = { ...rest, featured: !!featured, published: !!published, isDemo: !!isDemo };

  try {
    if (id) await db.portfolioProject.update({ where: { id }, data });
    else await db.portfolioProject.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { fieldErrors: { slug: ["Another project already uses this slug."] }, values };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  redirect("/admin/portfolio?saved=1");
}

export async function deletePortfolioProjectAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.portfolioProject.delete({ where: { id } }).catch(() => {});
  revalidatePath("/", "layout");
  redirect("/admin/portfolio?deleted=1");
}

export async function saveServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData);
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error), values, message: "Please fix the highlighted fields." };
  }
  const { id, published, ...rest } = parsed.data;
  await db.service.update({ where: { id }, data: { ...rest, published: !!published } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Service saved.", values };
}

export async function setMessageStatusAction(formData: FormData) {
  await requireAdmin();
  const parsed = messageStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await db.contactMessage.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } });
  revalidatePath("/admin", "layout");
}

export async function setUserRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  // Prevent admins from locking themselves out.
  if (parsed.data.userId === admin.id) return;
  await db.user.update({ where: { id: parsed.data.userId }, data: { role: parsed.data.role } });
  if (parsed.data.role === "CLIENT") {
    await db.session.deleteMany({ where: { userId: parsed.data.userId } });
  }
  revalidatePath("/admin/clients", "layout");
}
