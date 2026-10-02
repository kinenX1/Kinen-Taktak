"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { sendTeamEmail } from "@/lib/emails";
import { emailField, fieldErrorsOf, formValues, requiredText, type FormState } from "@/lib/validation/common";

const schema = z.object({
  to: emailField,
  subject: requiredText("Subject", 2, 200),
  body: requiredText("Message", 2, 10000),
  locale: z.enum(["en", "fr"]).catch("en"),
  recipientId: z.string().max(40).optional(),
  contactMessageId: z.string().max(40).optional(),
  applicationId: z.string().max(40).optional(),
});

/** Sends a one-off email written by the team, and keeps a copy in the log. */
export async function sendTeamEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = formValues(formData);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };
  const { to, subject, body, locale, recipientId, contactMessageId, applicationId } = parsed.data;

  const result = await sendTeamEmail({ to, subject, body, senderName: admin.name, locale });
  await db.outboundEmail.create({
    data: {
      to,
      subject,
      body,
      status: result.status,
      error: result.error,
      sentById: admin.id,
      recipientId: recipientId || null,
      contactMessageId: contactMessageId || null,
      applicationId: applicationId || null,
    },
  });
  if (contactMessageId) {
    await db.contactMessage.updateMany({ where: { id: contactMessageId, status: "NEW" }, data: { status: "READ" } });
  }
  revalidatePath("/admin", "layout");

  if (result.status === "FAILED") {
    return { message: `The email could not be sent: ${result.error ?? "unknown error"}. Check the SMTP settings.`, values };
  }
  if (result.status === "LOGGED") {
    return {
      ok: true,
      message: "Saved, but not delivered: email sending isn't set up yet (SMTP settings missing). The message is in the log.",
    };
  }
  return { ok: true, message: `Email sent to ${to}.` };
}

/** Removes someone from the mailing list. */
export async function deleteSubscriberAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.subscriber.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/audience");
}
