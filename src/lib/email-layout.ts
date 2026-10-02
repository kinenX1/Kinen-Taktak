import { siteConfig } from "@/config/site";

/**
 * Branded email layout. Table-based with inline styles so it renders the
 * same in Gmail, Outlook and Apple Mail. Every value is escaped.
 */
export type EmailContent = {
  preheader: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  /** Quoted text from a person, e.g. a chat message. Shown in a highlighted block. */
  quote?: string;
  /** Key/value facts shown as a small table. */
  facts?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  afterCta?: string[];
  signoff?: string;
  footer: string;
  footerNote: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const para = (s: string) => esc(s).replace(/\n/g, "<br>");

const C = {
  bg: "#060709",
  card: "#0d0f14",
  line: "#22252c",
  text: "#f4f2ec",
  muted: "#a2a5ad",
  dim: "#80848e",
  flux: "#ff5a1f",
};

export function renderEmail(c: EmailContent) {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const p = (s: string) => `<p style="margin:0 0 16px;font:400 15px/1.65 ${font};color:${C.muted}">${para(s)}</p>`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 24px;font:700 22px/1 ${font};letter-spacing:-0.04em;color:${C.text}">
<span style="display:inline-block;width:4px;height:18px;background:${C.flux};border-radius:2px;margin-right:10px;vertical-align:-2px"></span>MOV<span style="font-family:Georgia,serif;font-style:italic;font-weight:400;color:${C.flux}">e</span>RA
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:36px 32px">
<div style="height:2px;width:56px;background:${C.flux};border-radius:2px;margin:0 0 24px"></div>
<h1 style="margin:0 0 20px;font:600 26px/1.15 ${font};letter-spacing:-0.03em;color:${C.text}">${esc(c.heading)}</h1>
${c.greeting ? `<p style="margin:0 0 16px;font:500 15px/1.6 ${font};color:${C.text}">${esc(c.greeting)}</p>` : ""}
${c.paragraphs.map(p).join("\n")}
${
  c.quote
    ? `<div style="margin:8px 0 20px;padding:16px 18px;border-left:3px solid ${C.flux};background:#15171d;border-radius:0 12px 12px 0;font:400 15px/1.6 ${font};color:${C.text}">${para(c.quote)}</div>`
    : ""
}
${
  c.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-top:1px solid ${C.line}">${c.facts
        .map(
          (f) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font:500 11px/1.4 ${font};letter-spacing:0.12em;text-transform:uppercase;color:${C.dim};width:40%">${esc(f.label)}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font:400 14px/1.5 ${font};color:${C.text}">${para(f.value)}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${
  c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 20px"><tr><td style="border-radius:999px;background:${C.flux}"><a href="${esc(c.cta.url)}" style="display:inline-block;padding:14px 26px;font:600 15px/1 ${font};color:#060709;text-decoration:none;border-radius:999px">${esc(c.cta.label)} &rarr;</a></td></tr></table>`
    : ""
}
${(c.afterCta ?? []).map(p).join("\n")}
${c.signoff ? `<p style="margin:24px 0 0;font:500 15px/1.6 ${font};color:${C.text}">${esc(c.signoff)}</p>` : ""}
</td></tr>
<tr><td style="padding:24px 4px 0;font:400 12px/1.6 ${font};color:${C.dim}">
${esc(c.footer)}<br>${esc(c.footerNote)}<br><a href="${esc(siteConfig.url)}" style="color:${C.muted}">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a> · <a href="mailto:${esc(siteConfig.email)}" style="color:${C.muted}">${esc(siteConfig.email)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    c.heading,
    "",
    c.greeting,
    ...c.paragraphs,
    c.quote ? `> ${c.quote.replace(/\n/g, "\n> ")}` : undefined,
    ...(c.facts ?? []).map((f) => `${f.label}: ${f.value}`),
    c.cta ? `${c.cta.label}: ${c.cta.url}` : undefined,
    ...(c.afterCta ?? []),
    c.signoff,
    "",
    "—",
    c.footer,
    siteConfig.url,
  ]
    .filter((l) => l !== undefined)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
