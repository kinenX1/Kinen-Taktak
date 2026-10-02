"use server";

import { db } from "@/lib/db";
import { sendContactEmails } from "@/lib/emails";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth/dal";
import { getI18n } from "@/i18n/server";
import { localizedFieldErrors } from "@/i18n/errors";
import { contactSchema } from "@/lib/validation/contact";
import { formValues, type FormState } from "@/lib/validation/common";

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getI18n();
  const values = formValues(formData);

  // Honeypot: real people never see or fill this field.
  if (formData.get("website")) return { ok: true, message: t.contact.form.sent };

  const limited = await rateLimit("contact", 5, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.contact.form.rateLimited, values };

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: localizedFieldErrors(parsed.error, t), values };

  const user = await getCurrentUser();
  try {
    await db.contactMessage.create({ data: { ...parsed.data, userId: user?.id } });
  } catch (error) {
    console.error("[contact] failed", error);
    return { message: t.contact.form.failed, values };
  }

  await sendContactEmails({ ...parsed.data, locale });
  return { ok: true, message: t.contact.form.sent };
}
