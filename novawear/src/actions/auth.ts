"use server";

import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { createSession, invalidateAllSessions, invalidateCurrentSession } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { safeRedirectPath } from "@/lib/utils";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["password"]);
  const limited = await rateLimit("register", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: "Too many attempts. Please try again later.", values };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { name, email, phone, password } = parsed.data;
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { fieldErrors: { email: ["An account with this email already exists. Try signing in."] }, values };
  }

  const user = await db.user.create({
    data: { name, email, phone: phone ?? null, passwordHash: await hashPassword(password) },
    select: { id: true },
  });
  await createSession(user.id);
  redirect(safeRedirectPath(formData.get("next")));
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["password"]);
  const limited = await rateLimit("login", 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return { message: "Too many sign-in attempts. Please wait a few minutes and try again.", values };
  }

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, role: true } });
  const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);

  if (!user || !valid) {
    return { message: "That email and password combination didn't match.", values };
  }

  await createSession(user.id);
  const fallback = user.role === "ADMIN" ? "/admin" : "/account";
  redirect(safeRedirectPath(formData.get("next"), fallback));
}

export async function logoutAction() {
  await invalidateCurrentSession();
  redirect("/");
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const limited = await rateLimit("forgot-password", 5, 60 * 60 * 1000);
  if (!limited.ok) return { message: "Too many requests. Please try again later.", values };

  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true },
  });

  if (user) {
    // One active token per user.
    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const token = generateToken();
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const link = `${siteConfig.url}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your NovaWear password",
      text: `Hi ${user.name},\n\nWe received a request to reset your NovaWear password. Use the link below within the next hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.\n\n— NovaWear`,
    });
  }

  // Same response whether or not the account exists (prevents enumeration).
  return { ok: true, message: "If an account exists for that email, we've sent a link to reset the password." };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const limited = await rateLimit("reset-password", 10, 60 * 60 * 1000);
  if (!limited.ok) return { message: "Too many attempts. Please try again later." };

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return { message: "This reset link is invalid or has expired. Please request a new one." };
  }

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  // Sign out everywhere, then sign in on this device.
  await invalidateAllSessions(record.userId);
  await createSession(record.userId);
  redirect("/account?reset=1");
}
