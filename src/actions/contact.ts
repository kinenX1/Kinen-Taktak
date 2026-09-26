"use server";

import { db } from "@/lib/db";
import { adminNotificationEmail, sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth/dal";
import { contactSchema } from "@/lib/validation/contact";
import { fieldErrorsOf, formValues, type FormState } from "@/lib/validation/common";

export async function contactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);

  // Honeypot: real people never see or fill this field.
  if (formData.get("website")) return { ok: true };

  const limited = await rateLimit("contact", 5, 60 * 60 * 1000);
  if (!limited.ok) return { message: "You've sent several messages recently. Please try again later.", values };

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const user = await getCurrentUser();
  try {
    await db.contactMessage.create({ data: { ...parsed.data, userId: user?.id } });
  } catch (error) {
    console.error("[contact] failed", error);
    return { message: "We couldn't send your message because of a server problem. Please try again.", values };
  }

  const admin = adminNotificationEmail();
  if (admin) {
    await sendEmail({
      to: admin,
      subject: `New message: ${parsed.data.subject}`,
      text: `${parsed.data.name} <${parsed.data.email}>${parsed.data.company ? ` (${parsed.data.company})` : ""}\n\n${parsed.data.message}`,
    });
  }
  return { ok: true, message: "Thanks — your message is with us. We'll reply by email." };
}
