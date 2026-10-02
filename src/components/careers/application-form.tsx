"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { applyAction, type ApplicationState } from "@/actions/careers";
import { experienceLevels, SPONTANEOUS } from "@/config/careers";
import { useT } from "@/i18n/client";
import { ease } from "@/lib/motion";
import { cn, formatBytes } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, FieldError, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { Close, FileIcon, Upload } from "@/components/ui/icons";

type Role = { slug: string; title: string; team: string };

export function ApplicationForm({ roles, defaultRole, defaults }: { roles: Role[]; defaultRole: string; defaults: { fullName?: string; email?: string } }) {
  const t = useT();
  const f = t.careers.form;
  const [state, action, pending] = useActionState<ApplicationState, FormData>(applyAction, {});
  const [cv, setCv] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const cvRef = useRef<HTMLInputElement>(null);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  const setFile = (file: File | null) => {
    setCv(file);
    if (!cvRef.current) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    cvRef.current.files = dt.files;
  };

  // React resets the form after each submit; put the chosen CV back so a fix-and-resend keeps it.
  useEffect(() => {
    const input = cvRef.current;
    if (!cv || !input || input.files?.length) return;
    const dt = new DataTransfer();
    dt.items.add(cv);
    input.files = dt.files;
  }, [state, cv]);

  if (state.ok && state.reference) return <ApplicationSuccess reference={state.reference} />;

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-12" noValidate>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <aside className="lg:col-span-4">
        <div className="lg:sticky lg:top-28">
          <div className="beam-border rounded-xl bg-ink-900 p-6">
            <Field id="role" label={f.role} error={e.role}>
              {(a) => (
                <Select {...a} name="role" required defaultValue={v.role ?? defaultRole}>
                  <option value="" disabled>
                    {f.chooseRole}
                  </option>
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.title} — {r.team}
                    </option>
                  ))}
                  <option value={SPONTANEOUS}>{t.careers.spontaneous}</option>
                </Select>
              )}
            </Field>
            <ol className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-fog-400">
              {[f.sectionYou, f.sectionExperience, f.sectionLinks, f.sectionMotivation].map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full border border-line-strong font-mono text-2xs text-fog-200">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>

      <div className="space-y-12 lg:col-span-8">
        {state.message && <FormMessage>{state.message}</FormMessage>}

        <Section n="01" title={f.sectionYou}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="fullName" label={f.fullName} error={e.fullName}>
              {(a) => <Input {...a} name="fullName" autoComplete="name" required maxLength={100} defaultValue={v.fullName ?? defaults.fullName} />}
            </Field>
            <Field id="email" label={f.email} error={e.email}>
              {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={v.email ?? defaults.email} />}
            </Field>
            <Field id="phone" label={f.phone} optional error={e.phone}>
              {(a) => <Input {...a} name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={v.phone} />}
            </Field>
            <Field id="country" label={f.country} optional error={e.country}>
              {(a) => <Input {...a} name="country" autoComplete="country-name" maxLength={80} defaultValue={v.country} />}
            </Field>
            <Field id="city" label={f.city} optional error={e.city}>
              {(a) => <Input {...a} name="city" autoComplete="address-level2" maxLength={80} defaultValue={v.city} />}
            </Field>
            <Field id="languages" label={f.languages} hint={f.languagesHint} optional error={e.languages}>
              {(a) => <Input {...a} name="languages" maxLength={200} defaultValue={v.languages} />}
            </Field>
          </div>
        </Section>

        <Section n="02" title={f.sectionExperience}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="yearsExperience" label={f.years} optional error={e.yearsExperience}>
              {(a) => (
                <Select {...a} name="yearsExperience" defaultValue={v.yearsExperience ?? ""}>
                  <option value="">{f.chooseYears}</option>
                  {experienceLevels.map((k) => (
                    <option key={k} value={k}>
                      {t.options.experience[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="workMode" label={f.workMode} optional error={e.workMode}>
              {(a) => (
                <Select {...a} name="workMode" defaultValue={v.workMode ?? ""}>
                  <option value="">{f.noPreference}</option>
                  {(["REMOTE", "HYBRID", "ON_SITE"] as const).map((m) => (
                    <option key={m} value={m}>
                      {t.options.workModes[m]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="skills" label={f.skills} hint={f.skillsHint} optional error={e.skills} className="sm:col-span-2">
              {(a) => <Input {...a} name="skills" maxLength={400} defaultValue={v.skills} />}
            </Field>
            <Field id="availability" label={f.availability} hint={f.availabilityHint} optional error={e.availability}>
              {(a) => <Input {...a} name="availability" maxLength={120} defaultValue={v.availability} />}
            </Field>
            <Field id="expectedSalary" label={f.salary} hint={f.salaryHint} optional error={e.expectedSalary}>
              {(a) => <Input {...a} name="expectedSalary" maxLength={120} defaultValue={v.expectedSalary} />}
            </Field>
          </div>
        </Section>

        <Section n="03" title={f.sectionLinks}>
          <div className="grid gap-6 sm:grid-cols-3">
            <Field id="linkedin" label={f.linkedin} optional error={e.linkedin}>
              {(a) => <Input {...a} name="linkedin" inputMode="url" placeholder="linkedin.com/in/…" maxLength={300} defaultValue={v.linkedin} />}
            </Field>
            <Field id="portfolio" label={f.portfolio} optional error={e.portfolio}>
              {(a) => <Input {...a} name="portfolio" inputMode="url" placeholder="https://" maxLength={300} defaultValue={v.portfolio} />}
            </Field>
            <Field id="github" label={f.github} optional error={e.github}>
              {(a) => <Input {...a} name="github" inputMode="url" placeholder="github.com/…" maxLength={300} defaultValue={v.github} />}
            </Field>
          </div>

          <div className="mt-6">
            <p id="cv-label" className="mb-3 flex items-baseline justify-between text-sm font-medium text-fog-200">
              {f.cv}
              <span className="font-mono text-2xs uppercase tracking-[0.12em] text-fog-500">{t.common.optional}</span>
            </p>
            <input
              ref={cvRef}
              type="file"
              name="cv"
              accept=".pdf,.doc,.docx"
              className="sr-only"
              tabIndex={-1}
              aria-labelledby="cv-label"
              onChange={(ev) => setCv(ev.target.files?.[0] ?? null)}
            />
            <AnimatePresence mode="wait" initial={false}>
              {cv ? (
                <motion.div key="file" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-lg border border-flux/40 bg-flux/[0.06] px-4 py-4 text-sm">
                  <FileIcon size={18} className="shrink-0 text-flux" />
                  <span className="min-w-0 flex-1 truncate text-fog-50">{cv.name}</span>
                  <span className="font-mono text-2xs text-fog-500">{formatBytes(cv.size)}</span>
                  <button type="button" onClick={() => setFile(null)} aria-label={f.cvRemove} className="flex size-8 items-center justify-center rounded-full text-fog-400 hover:bg-fog-50/10 hover:text-fog-50">
                    <Close size={14} />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="drop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    setDragging(false);
                    const file = ev.dataTransfer.files[0];
                    if (file) setFile(file);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-9 text-center transition-colors duration-300",
                    dragging ? "border-flux bg-flux/[0.06]" : "border-line-strong bg-ink-900/40",
                  )}
                >
                  <span className="flex size-11 items-center justify-center rounded-full border border-line text-fog-200">
                    <Upload size={18} />
                  </span>
                  <p className="text-sm text-fog-200">
                    {f.cvDrop}{" "}
                    <button type="button" onClick={() => cvRef.current?.click()} className="font-medium text-flux underline-offset-4 hover:underline">
                      {f.cvBrowse}
                    </button>
                  </p>
                  <p className="text-xs text-fog-500">{f.cvHint}</p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-2">
              <FieldError id="cv-error" errors={e.cv} />
            </div>
          </div>
        </Section>

        <Section n="04" title={f.sectionMotivation}>
          <Field id="motivation" label={f.motivation} hint={f.motivationHint} error={e.motivation}>
            {(a) => <Textarea {...a} name="motivation" rows={7} required minLength={50} maxLength={5000} defaultValue={v.motivation} />}
          </Field>
          <div className="mt-6">
            <Checkbox
              name="consent"
              required
              defaultChecked={v.consent === "on"}
              aria-invalid={e.consent ? true : undefined}
              label={
                <>
                  {f.consent}{" "}
                  <Link href="/privacy" className="text-fog-50 underline underline-offset-2">
                    {f.consentLink}
                  </Link>
                  .
                </>
              }
            />
            <div className="mt-2">
              <FieldError id="consent-error" errors={e.consent} />
            </div>
          </div>
        </Section>

        <div className="flex justify-end border-t border-line pt-8">
          <Button type="submit" size="lg" arrow pending={pending}>
            {pending ? f.submitting : f.submit}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.9, ease: ease.outExpo }}
    >
      <p className="eyebrow mb-3 text-flux">{n} / 04</p>
      <h2 className="mb-8 text-display-md font-medium">{title}</h2>
      {children}
    </motion.section>
  );
}

function ApplicationSuccess({ reference }: { reference: string }) {
  const t = useT().careers.success;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: ease.outExpo }}
      role="status"
      className="grain relative overflow-hidden rounded-xl border border-line bg-ink-900 px-6 py-16 text-center md:px-16 md:py-24"
    >
      <div aria-hidden="true" className="absolute inset-x-0 -top-1/2 mx-auto size-[48rem] rounded-full bg-[radial-gradient(circle,rgb(139_156_255/0.16),transparent_60%)]" />
      <svg viewBox="0 0 80 80" className="relative mx-auto size-20" aria-hidden="true">
        <motion.circle cx="40" cy="40" r="36" fill="none" stroke="var(--color-flux)" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: ease.outExpo }} />
        <motion.path d="M25 41 l10 10 20-22" fill="none" stroke="var(--color-fog-50)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: ease.outExpo, delay: 0.7 }} />
      </svg>
      <div className="relative">
        <p className="eyebrow mt-10">{t.eyebrow}</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-display-md font-medium">
          {t.title1} <span className="accent-serif text-flux">{t.title2}</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg leading-relaxed text-fog-400">{t.body}</p>
        <div className="mx-auto mt-10 inline-flex items-center gap-4 rounded-full border border-line bg-ink-950 px-6 py-3">
          <span className="eyebrow">{t.reference}</span>
          <span className="font-mono text-lg tracking-[0.08em] text-fog-50">{reference}</span>
        </div>
        <div className="mt-10">
          <ButtonLink href="/careers" variant="secondary">
            {t.back}
          </ButtonLink>
        </div>
      </div>
    </motion.div>
  );
}
