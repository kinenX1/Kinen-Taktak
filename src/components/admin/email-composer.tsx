"use client";

import { useActionState, useState } from "react";
import { sendTeamEmailAction } from "@/actions/email";
import { initialFormState } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";

type Template = { label: string; subject?: (s: string) => string; body: (first: string) => string };

const templates: Record<"en" | "fr", Template[]> = {
  en: [
    { label: "Reply", body: (n) => `Hi ${n},\n\nThank you for reaching out to MovEra.\n\n` },
    { label: "Follow-up", body: (n) => `Hi ${n},\n\nI wanted to follow up on our last conversation. Do you have a few minutes this week for a quick call?\n\n` },
    {
      label: "Interview",
      subject: () => "Interview invitation — MovEra",
      body: (n) => `Hi ${n},\n\nThank you for your application. We'd love to get to know you better. Would you be available for a 20-minute video call this week? Please reply with a few times that work for you.\n\n`,
    },
    {
      label: "Not selected",
      subject: () => "Your application to MovEra",
      body: (n) => `Hi ${n},\n\nThank you for taking the time to apply. After careful consideration, we've decided not to move forward at this time. We'll keep your details and may reach out about future roles.\n\nWe wish you all the best.\n\n`,
    },
  ],
  fr: [
    { label: "Réponse", body: (n) => `Bonjour ${n},\n\nMerci d'avoir contacté MovEra.\n\n` },
    { label: "Relance", body: (n) => `Bonjour ${n},\n\nJe me permets de revenir vers vous suite à notre dernier échange. Auriez-vous quelques minutes cette semaine pour un court appel ?\n\n` },
    {
      label: "Entretien",
      subject: () => "Invitation à un entretien — MovEra",
      body: (n) => `Bonjour ${n},\n\nMerci pour votre candidature. Nous aimerions faire votre connaissance. Seriez-vous disponible cette semaine pour un appel vidéo de 20 minutes ? Indiquez-nous quelques créneaux qui vous conviennent.\n\n`,
    },
    {
      label: "Non retenue",
      subject: () => "Votre candidature chez MovEra",
      body: (n) => `Bonjour ${n},\n\nMerci d'avoir pris le temps de postuler. Après réflexion, nous avons décidé de ne pas donner suite pour le moment. Nous conservons votre profil et pourrons revenir vers vous pour de futurs postes.\n\nNous vous souhaitons une belle continuation.\n\n`,
    },
  ],
};

/**
 * Write and send a real email to a client, applicant or subscriber from the
 * admin panel. The message is wrapped in the MovEra email design and logged.
 */
export function EmailComposer({
  to,
  name,
  defaultSubject = "",
  locale: initialLocale,
  recipientId,
  contactMessageId,
  applicationId,
  compact,
}: {
  to: string;
  name?: string | null;
  defaultSubject?: string;
  locale?: string | null;
  recipientId?: string;
  contactMessageId?: string;
  applicationId?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(sendTeamEmailAction, initialFormState);
  const [locale, setLocale] = useState<"en" | "fr">(initialLocale === "fr" ? "fr" : "en");
  const first = (name ?? "").trim().split(/\s+/)[0] || (locale === "fr" ? "" : "there");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(() => templates[locale][0]!.body(first));
  const [sentKey, setSentKey] = useState(state);

  // Clear the form after a successful send.
  if (sentKey !== state) {
    setSentKey(state);
    if (state.ok) setBody(templates[locale][0]!.body(first));
  }

  return (
    <form action={action} className={cn("space-y-4", compact ? "pt-4" : "p-5")} noValidate>
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="locale" value={locale} />
      {recipientId && <input type="hidden" name="recipientId" value={recipientId} />}
      {contactMessageId && <input type="hidden" name="contactMessageId" value={contactMessageId} />}
      {applicationId && <input type="hidden" name="applicationId" value={applicationId} />}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="min-w-0 truncate text-fog-400">
          To <span className="text-fog-50">{to}</span>
        </p>
        <div role="group" aria-label="Email language" className="flex rounded-full border border-line p-0.5 font-mono text-2xs uppercase">
          {(["en", "fr"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={locale === l}
              onClick={() => setLocale(l)}
              className={cn("h-7 rounded-full px-2.5", locale === l ? "bg-fog-50 text-ink-950" : "text-fog-400 hover:text-fog-50")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {templates[locale].map((tpl) => (
          <button
            key={tpl.label}
            type="button"
            onClick={() => {
              setBody(tpl.body(first));
              if (tpl.subject) setSubject(tpl.subject(subject));
            }}
            className="h-8 rounded-full border border-line px-3 text-xs text-fog-200 transition-colors hover:border-flux/50 hover:text-fog-50"
          >
            {tpl.label}
          </button>
        ))}
      </div>

      <Field id={`subject-${to}`} label="Subject" error={state.fieldErrors?.subject}>
        {(a) => <Input {...a} name="subject" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />}
      </Field>
      <Field id={`body-${to}`} label="Message" hint="Leave a blank line between paragraphs. Your name and MovEra are added as the signature." error={state.fieldErrors?.body}>
        {(a) => <Textarea {...a} name="body" rows={compact ? 6 : 8} required maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <Button type="submit" pending={pending} arrow className="w-full">
        {pending ? "Sending" : "Send email"}
      </Button>
    </form>
  );
}
