import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { siteConfig } from "@/config/site";

export type Email = { to: string; subject: string; text: string; html?: string; replyTo?: string };
export type SendResult = { status: "SENT" | "FAILED" | "LOGGED"; error?: string };

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

export const emailConfigured = () => !!process.env.SMTP_HOST;

/**
 * Sends an email through SMTP when configured (e.g. Gmail: smtp.gmail.com,
 * port 465, SMTP_SECURE=true and an App Password). Without SMTP settings the
 * message is written to the server log so flows remain testable locally.
 * Failures are logged and reported in the result, never thrown.
 */
export async function sendEmail(email: Email): Promise<SendResult> {
  const t = getTransporter();
  if (!t) {
    console.info(`\n[email:not-configured] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
    return { status: "LOGGED" };
  }
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? `${siteConfig.name} <${siteConfig.email}>`,
      ...email,
    });
    return { status: "SENT" };
  } catch (error) {
    console.error("[email] Failed to send", error);
    return { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" };
  }
}

export function adminNotificationEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || null;
}
