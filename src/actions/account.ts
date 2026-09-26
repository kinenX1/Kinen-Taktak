"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { invalidateAllSessions, invalidateCurrentSession } from "@/lib/auth/session";
import { deleteStoredFile } from "@/lib/uploads";
import {
  changePasswordSchema,
  deleteAccountSchema,
  profileSchema,
} from "@/lib/validation/auth";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { name, phone, company, country } = parsed.data;
  await db.user.update({
    where: { id: user.id },
    data: { name, phone: phone || null, company: company || null, country: country || null },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Profile saved.", values };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const limited = await rateLimit("change-password", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: "Too many attempts. Please try again later." };

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(record.passwordHash, parsed.data.currentPassword))) {
    return { fieldErrors: { currentPassword: ["That password is incorrect."] } };
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await invalidateAllSessions(user.id, true);
  return { ok: true, message: "Password updated. Other devices have been signed out." };
}

export async function signOutOtherSessionsAction() {
  const user = await requireUser();
  await invalidateAllSessions(user.id, true);
  revalidatePath("/dashboard/settings");
}

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role === "ADMIN") {
    return { message: "Administrator accounts can't be deleted from here. Ask another admin to change your role first." };
  }
  const parsed = deleteAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const record = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, projectRequests: { select: { files: { select: { storedName: true } } } } },
  });
  if (!(await verifyPassword(record.passwordHash, parsed.data.password))) {
    return { fieldErrors: { password: ["That password is incorrect."] } };
  }

  const files = record.projectRequests.flatMap((r) => r.files.map((f) => f.storedName));
  await invalidateCurrentSession();
  await db.user.delete({ where: { id: user.id } });
  await Promise.all(files.map(deleteStoredFile));
  redirect("/?account=deleted");
}
