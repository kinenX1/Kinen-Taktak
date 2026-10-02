"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/emails";
import { getI18n } from "@/i18n/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { localizedFieldErrors } from "@/i18n/errors";
import { rateLimit } from "@/lib/rate-limit";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { createSession, invalidateAllSessions, invalidateCurrentSession } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { safeRedirectPath } from "@/lib/utils";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { formValues, type FormState } from "@/lib/validation/common";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getI18n();
  const values = formValues(formData, ["password"]);
  const limited = await rateLimit("register", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.auth.server.tooMany, values };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t), values };

  const { name, email, password } = parsed.data;
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { fieldErrors: { email: [t.auth.server.exists] }, values };
  }

  const user = await db.user.create({
    data: { name, email, locale, passwordHash: await hashPassword(password) },
    select: { id: true },
  });
  await createSession(user.id);
  await sendWelcomeEmail({ name, email, locale });
  redirect(safeRedirectPath(formData.get("next")));
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const values = formValues(formData, ["password"]);
  const limited = await rateLimit("login", 10, 15 * 60 * 1000);
  if (!limited.ok) return { message: t.auth.server.tooManyLogin, values };

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t), values };

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, role: true, locale: true },
  });

  const valid = user
    ? await verifyPassword(user.passwordHash, password)
    : await verifyAgainstDummy(password);

  if (!user || !valid) {
    return { message: t.auth.server.mismatch, values };
  }

  await createSession(user.id);
  // A new device picks up the language saved on the account.
  const store = await cookies();
  if (!store.has(LOCALE_COOKIE)) {
    store.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  const fallback = user.role === "ADMIN" ? "/admin" : "/dashboard";
  redirect(safeRedirectPath(formData.get("next"), fallback));
}

export async function logoutAction() {
  await invalidateCurrentSession();
  redirect("/");
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getI18n();
  const values = formValues(formData);
  const limited = await rateLimit("forgot-password", 5, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.auth.server.tooManyRequests, values };

  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t), values };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true, locale: true },
  });

  if (user) {
    // One active token per user.
    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const token = generateToken();
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await sendPasswordResetEmail(user, `${siteConfig.url}/reset-password?token=${token}`);
  }

  // Same response whether or not the account exists (prevents enumeration).
  return { ok: true, message: t.auth.server.resetSent };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { t } = await getI18n();
  const limited = await rateLimit("reset-password", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.auth.server.tooMany };

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t) };

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return { message: t.auth.server.resetInvalid };
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  // Sign out everywhere, then sign in on this device.
  await invalidateAllSessions(record.userId);
  await createSession(record.userId);
  redirect("/dashboard?reset=1");
}
