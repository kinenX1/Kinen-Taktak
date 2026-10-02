import "server-only";
import { siteConfig } from "@/config/site";
import { fmt, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { adminNotificationEmail, sendEmail } from "./email";
import { renderEmail, type EmailContent } from "./email-layout";

/**
 * Every email MovEra sends. Messages to clients and applicants use the
 * recipient's language; notifications to the team are in English.
 */

const url = (path: string) => `${siteConfig.url}${path}`;
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const lang = (l: string | null | undefined): Locale => (isLocale(l) ? l : "en");

function compose(locale: Locale, content: Omit<EmailContent, "footer" | "footerNote">) {
  const t = getDictionary(locale).emails;
  return renderEmail({
    ...content,
    footer: t.footer,
    footerNote: fmt(t.footerNote, { site: siteConfig.name }),
  });
}

async function deliver(to: string, subject: string, content: ReturnType<typeof compose>, replyTo?: string) {
  return sendEmail({ to, subject, text: content.text, html: content.html, replyTo });
}

async function notifyTeam(subject: string, content: Omit<EmailContent, "footer" | "footerNote">, replyTo?: string) {
  const admin = adminNotificationEmail();
  if (!admin) return;
  await deliver(admin, `[MovEra] ${subject}`, compose("en", content), replyTo);
}

type Person = { name: string; email: string; locale?: string | null };

// ── Accounts ───────────────────────────────────────────────

export async function sendWelcomeEmail(user: Person) {
  const locale = lang(user.locale);
  const t = getDictionary(locale).emails;
  await deliver(
    user.email,
    fmt(t.welcome.subject, { name: first(user.name) }),
    compose(locale, {
      preheader: t.welcome.preheader,
      heading: t.welcome.heading,
      greeting: fmt(t.greeting, { name: first(user.name) }),
      paragraphs: [t.welcome.body],
      cta: { label: t.welcome.cta, url: url("/dashboard") },
      signoff: t.signoff,
    }),
  );
}

export async function sendPasswordResetEmail(user: Person, link: string) {
  const locale = lang(user.locale);
  const t = getDictionary(locale).emails;
  await deliver(
    user.email,
    t.passwordReset.subject,
    compose(locale, {
      preheader: t.passwordReset.preheader,
      heading: t.passwordReset.heading,
      greeting: fmt(t.greeting, { name: first(user.name) }),
      paragraphs: [t.passwordReset.body],
      cta: { label: t.passwordReset.cta, url: link },
      afterCta: [t.passwordReset.ignore],
      signoff: t.signoff,
    }),
  );
}

// ── Project requests ───────────────────────────────────────

export async function sendRequestReceivedEmails(r: {
  reference: string;
  title: string;
  contactName: string;
  contactEmail: string;
  locale: Locale;
  typeLabel: string;
  budgetLabel: string;
  timelineLabel: string;
}) {
  const t = getDictionary(r.locale).emails;
  await deliver(
    r.contactEmail,
    fmt(t.requestReceived.subject, { reference: r.reference }),
    compose(r.locale, {
      preheader: t.requestReceived.preheader,
      heading: t.requestReceived.heading,
      greeting: fmt(t.greeting, { name: first(r.contactName) }),
      paragraphs: [fmt(t.requestReceived.body, { title: r.title }), fmt(t.requestReceived.reference, { reference: r.reference })],
      cta: { label: t.requestReceived.cta, url: url(`/dashboard/requests/${r.reference}`) },
      signoff: t.signoff,
    }),
  );
  await notifyTeam(
    `New project request ${r.reference}: ${r.title}`,
    {
      preheader: `${r.contactName} sent a new brief.`,
      heading: "New project request",
      paragraphs: [`${r.contactName} <${r.contactEmail}> submitted a brief.`],
      facts: [
        { label: "Project", value: r.title },
        { label: "Type", value: r.typeLabel },
        { label: "Budget", value: r.budgetLabel },
        { label: "Timeline", value: r.timelineLabel },
        { label: "Reference", value: r.reference },
      ],
      cta: { label: "Open in admin", url: url(`/admin/requests/${r.reference}`) },
    },
    r.contactEmail,
  );
}

export async function sendStatusChangedEmail(r: {
  reference: string;
  title: string;
  contactName: string;
  contactEmail: string;
  locale: Locale;
  statusLabel: string;
  note?: string | null;
}) {
  const t = getDictionary(r.locale).emails;
  await deliver(
    r.contactEmail,
    fmt(t.statusChanged.subject, { reference: r.reference, status: r.statusLabel }),
    compose(r.locale, {
      preheader: fmt(t.statusChanged.preheader, { title: r.title }),
      heading: t.statusChanged.heading,
      greeting: fmt(t.greeting, { name: first(r.contactName) }),
      paragraphs: [fmt(t.statusChanged.body, { title: r.title, status: r.statusLabel })],
      quote: r.note ?? undefined,
      cta: { label: t.statusChanged.cta, url: url(`/dashboard/requests/${r.reference}`) },
      signoff: t.signoff,
    }),
  );
}

export async function sendChatMessageEmail(m: {
  toClient: boolean;
  reference: string;
  title: string;
  authorName: string;
  body: string;
  client: Person;
}) {
  if (m.toClient) {
    const locale = lang(m.client.locale);
    const t = getDictionary(locale).emails;
    const author = `${m.authorName} (MovEra)`;
    await deliver(
      m.client.email,
      fmt(t.newMessage.subject, { title: m.title }),
      compose(locale, {
        preheader: fmt(t.newMessage.preheader, { author }),
        heading: t.newMessage.heading,
        greeting: fmt(t.greeting, { name: first(m.client.name) }),
        paragraphs: [fmt(t.newMessage.body, { author, title: m.title })],
        quote: m.body,
        cta: { label: t.newMessage.cta, url: url(`/dashboard/requests/${m.reference}#chat`) },
        signoff: t.signoff,
      }),
    );
    return;
  }
  await notifyTeam(
    `New message from ${m.client.name} — ${m.reference}`,
    {
      preheader: `${m.client.name} wrote about “${m.title}”.`,
      heading: "New client message",
      paragraphs: [`${m.client.name} <${m.client.email}> wrote about “${m.title}”:`],
      quote: m.body,
      cta: { label: "Reply in admin", url: url(`/admin/requests/${m.reference}#chat`) },
    },
    m.client.email,
  );
}

// ── Contact form ───────────────────────────────────────────

export async function sendContactEmails(m: { name: string; email: string; company?: string; subject: string; message: string; locale: Locale }) {
  const t = getDictionary(m.locale).emails;
  await deliver(
    m.email,
    t.contactReceived.subject,
    compose(m.locale, {
      preheader: t.contactReceived.preheader,
      heading: t.contactReceived.heading,
      greeting: fmt(t.greeting, { name: first(m.name) }),
      paragraphs: [fmt(t.contactReceived.body, { subject: m.subject })],
      quote: m.message,
      signoff: t.signoff,
    }),
  );
  await notifyTeam(
    `New message: ${m.subject}`,
    {
      preheader: `${m.name} used the contact form.`,
      heading: "New contact message",
      paragraphs: [`${m.name} <${m.email}>${m.company ? ` · ${m.company}` : ""}`],
      quote: m.message,
      cta: { label: "Open messages", url: url("/admin/messages") },
    },
    m.email,
  );
}

// ── Careers ────────────────────────────────────────────────

export async function sendApplicationEmails(a: {
  id: string;
  reference: string;
  roleTitle: string;
  fullName: string;
  email: string;
  locale: Locale;
  country?: string | null;
  yearsLabel?: string | null;
  hasCv: boolean;
}) {
  const t = getDictionary(a.locale).emails;
  await deliver(
    a.email,
    fmt(t.applicationReceived.subject, { reference: a.reference }),
    compose(a.locale, {
      preheader: t.applicationReceived.preheader,
      heading: t.applicationReceived.heading,
      greeting: fmt(t.greeting, { name: first(a.fullName) }),
      paragraphs: [fmt(t.applicationReceived.body, { role: a.roleTitle }), fmt(t.applicationReceived.reference, { reference: a.reference })],
      signoff: t.signoff,
    }),
  );
  await notifyTeam(
    `New application ${a.reference}: ${a.roleTitle}`,
    {
      preheader: `${a.fullName} applied for ${a.roleTitle}.`,
      heading: "New job application",
      paragraphs: [`${a.fullName} <${a.email}> applied.`],
      facts: [
        { label: "Role", value: a.roleTitle },
        ...(a.country ? [{ label: "Country", value: a.country }] : []),
        ...(a.yearsLabel ? [{ label: "Experience", value: a.yearsLabel }] : []),
        { label: "CV", value: a.hasCv ? "Attached" : "No CV (links only)" },
      ],
      cta: { label: "Review application", url: url(`/admin/careers/applications/${a.id}`) },
    },
    a.email,
  );
}

// ── Audience ───────────────────────────────────────────────

export async function sendSubscribedEmail(email: string, locale: Locale) {
  const t = getDictionary(locale).emails;
  await deliver(
    email,
    t.subscribed.subject,
    compose(locale, {
      preheader: t.subscribed.preheader,
      heading: t.subscribed.heading,
      paragraphs: [t.subscribed.body],
      cta: { label: "MovEra", url: url("/work") },
      signoff: t.signoff,
    }),
  );
}

/** A message written by the team in the admin composer. */
export async function sendTeamEmail(e: { to: string; subject: string; body: string; senderName: string; locale: Locale }) {
  const content = compose(e.locale, {
    preheader: e.body.slice(0, 120),
    heading: e.subject,
    paragraphs: e.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    signoff: `${e.senderName}\nMovEra`,
  });
  return sendEmail({ to: e.to, subject: e.subject, text: content.text, html: content.html, replyTo: siteConfig.email });
}
