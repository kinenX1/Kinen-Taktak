"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState } from "react";
import { contactAction } from "@/actions/contact";
import { initialFormState } from "@/lib/validation/common";
import { ease } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { Check } from "@/components/ui/icons";
import { useT } from "@/i18n/client";

export function ContactForm({ defaultName, defaultEmail }: { defaultName?: string; defaultEmail?: string }) {
  const t = useT().contact.form;
  const [state, action, pending] = useActionState(contactAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.ok ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: ease.outExpo }}
          className="flex min-h-[28rem] flex-col items-start justify-center rounded-xl border border-line bg-ink-900 p-8 md:p-12"
          role="status"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
            <Check size={26} />
          </span>
          <h2 className="mt-8 text-display-md font-medium">{t.sentTitle}</h2>
          <p className="mt-4 max-w-md leading-relaxed text-fog-400">{state.message}</p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          action={action}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6 rounded-xl border border-line bg-ink-900/60 p-6 md:p-10"
          noValidate
        >
          {state.message && <FormMessage>{state.message}</FormMessage>}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="name" label={t.name} error={e.name}>
              {(a) => <Input {...a} name="name" autoComplete="name" required maxLength={80} defaultValue={v.name ?? defaultName} />}
            </Field>
            <Field id="email" label={t.email} error={e.email}>
              {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={v.email ?? defaultEmail} />}
            </Field>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="company" label={t.company} optional error={e.company}>
              {(a) => <Input {...a} name="company" autoComplete="organization" maxLength={120} defaultValue={v.company} />}
            </Field>
            <Field id="subject" label={t.subject} error={e.subject}>
              {(a) => <Input {...a} name="subject" required maxLength={150} defaultValue={v.subject} />}
            </Field>
          </div>
          <Field id="message" label={t.message} error={e.message}>
            {(a) => <Textarea {...a} name="message" rows={6} required minLength={10} maxLength={5000} defaultValue={v.message} />}
          </Field>
          {/* Honeypot — hidden from people and assistive tech */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <p className="text-xs text-fog-500">{t.privacy}</p>
            <Button type="submit" pending={pending} arrow>
              {pending ? t.sending : t.send}
            </Button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
