"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { sendSubscribedEmail } from "@/lib/emails";
import { rateLimit } from "@/lib/rate-limit";
import { getI18n } from "@/i18n/server";
import { emailField, type FormState } from "@/lib/validation/common";

const schema = z.object({ email: emailField, source: z.enum(["footer", "careers"]).catch("footer") });

/** Adds an email to the audience list. Re-subscribing simply reactivates it. */
export async function subscribeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { locale, t } = await getI18n();
  if (formData.get("website")) return { ok: true, message: t.newsletter.success };

  const limited = await rateLimit("subscribe", 8, 60 * 60 * 1000);
  if (!limited.ok) return { message: t.newsletter.error };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: t.newsletter.invalid, values: { email: String(formData.get("email") ?? "") } };

  const { email, source } = parsed.data;
  try {
    const existing = await db.subscriber.findUnique({ where: { email } });
    if (existing && !existing.unsubscribedAt) return { ok: true, message: t.newsletter.already };
    if (existing) await db.subscriber.update({ where: { email }, data: { unsubscribedAt: null, locale } });
    else await db.subscriber.create({ data: { email, locale, source } });
  } catch (error) {
    console.error("[subscribe] failed", error);
    return { message: t.newsletter.error };
  }
  await sendSubscribedEmail(email, locale);
  return { ok: true, message: t.newsletter.success };
}
