import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { siteConfig } from "@/config/site";

type Email = { to: string; subject: string; text: string; html?: string };

let transporter: Transporter | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  transporter = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      })
    : null;
  return transporter;
}

/**
 * Sends an email through SMTP when configured. Without SMTP settings the
 * message is written to the server log so flows remain testable locally.
 * Failures are logged and never thrown to the user.
 */
export async function sendEmail(email: Email) {
  const t = getTransporter();
  if (!t) {
    console.info(
      `\n[email:not-configured] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`,
    );
    return;
  }
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? `${siteConfig.name} <${siteConfig.email}>`,
      ...email,
    });
  } catch (error) {
    console.error("[email] Failed to send", error);
  }
}

export function adminNotificationEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || null;
}
