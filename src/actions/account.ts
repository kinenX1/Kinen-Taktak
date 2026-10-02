"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { invalidateAllSessions, invalidateCurrentSession } from "@/lib/auth/session";
import { deleteStoredFile, imageKind } from "@/lib/uploads";
import { getI18n } from "@/i18n/server";
import { localizedFieldErrors } from "@/i18n/errors";
import {
  changePasswordSchema,
  deleteAccountSchema,
  profileSchema,
} from "@/lib/validation/auth";
import { formValues, type FormState } from "@/lib/validation/common";

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const values = formValues(formData);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t), values };

  const { name, phone, company, country } = parsed.data;
  await db.user.update({
    where: { id: user.id },
    data: { name, phone: phone || null, company: company || null, country: country || null },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: t.dashboard.profile.saved, values };
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const limited = await rateLimit("change-password", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.dashboard.settings.tooMany };

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t) };

  const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(record.passwordHash, parsed.data.currentPassword))) {
    return { fieldErrors: { currentPassword: [t.dashboard.settings.wrongPassword] } };
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await invalidateAllSessions(user.id, true);
  return { ok: true, message: t.dashboard.settings.updated };
}

export async function signOutOtherSessionsAction() {
  const user = await requireUser();
  await invalidateAllSessions(user.id, true);
  revalidatePath("/dashboard/settings");
}

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (user.role === "ADMIN") return { message: t.dashboard.settings.adminNoDelete };
  const parsed = deleteAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t) };

  const record = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, projectRequests: { select: { files: { select: { storedName: true } } } } },
  });
  if (!(await verifyPassword(record.passwordHash, parsed.data.password))) {
    return { fieldErrors: { password: [t.dashboard.settings.wrongPassword] } };
  }

  const files = record.projectRequests.flatMap((r) => r.files.map((f) => f.storedName));
  await invalidateCurrentSession();
  await db.user.delete({ where: { id: user.id } });
  await Promise.all(files.map(deleteStoredFile));
  redirect("/?account=deleted");
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Saves a profile photo. The browser crops and resizes it to a square
 * before upload; the server still verifies the bytes are a real image.
 */
export async function uploadAvatarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const limited = await rateLimit("avatar", 20, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.dashboard.settings.tooMany };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { message: t.dashboard.profile.photoInvalid };
  if (file.size > MAX_AVATAR_BYTES) return { message: t.dashboard.profile.photoTooLarge };
  const data = Buffer.from(await file.arrayBuffer());
  const mimeType = imageKind(data);
  if (!mimeType || mimeType === "image/gif") return { message: t.dashboard.profile.photoInvalid };

  try {
    await db.$transaction([
      db.avatar.upsert({ where: { userId: user.id }, create: { userId: user.id, mimeType, data }, update: { mimeType, data } }),
      db.user.update({ where: { id: user.id }, data: { avatarAt: new Date() } }),
    ]);
  } catch (error) {
    console.error("[avatar] failed", error);
    return { message: t.dashboard.profile.photoFailed };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: t.dashboard.profile.photoSaved };
}

export async function removeAvatarAction(): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  await db.$transaction([
    db.avatar.deleteMany({ where: { userId: user.id } }),
    db.user.update({ where: { id: user.id }, data: { avatarAt: null } }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: t.dashboard.profile.photoRemoved };
}
