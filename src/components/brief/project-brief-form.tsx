"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { submitProjectRequest, type ProjectFormState } from "@/actions/project-request";
import { budgetRanges, labelFor, projectTypes, timelines } from "@/config/project-brief";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { ArrowLeft, Check } from "@/components/ui/icons";
import { useLenis } from "@/components/motion/smooth-scroll";
import { OptionCards } from "./option-cards";
import { FileDrop } from "./file-drop";
import { SuccessPanel } from "./success-panel";

export type BriefDefaults = Partial<Record<string, string>> & { inspiration?: string };

type Props = {
  signedIn: boolean;
  defaults: BriefDefaults;
  draftRef?: string;
  existingFileCount?: number;
};

const STORAGE_KEY = "movera:brief";

const steps = [
  { id: "you", title: "About you", fields: ["contactName", "contactEmail", "contactPhone", "contactCompany", "contactCountry", "accountPassword"] },
  { id: "project", title: "The project", fields: ["title", "projectType", "otherType", "description"] },
  { id: "context", title: "Context", fields: ["business", "targetUsers", "features"] },
  { id: "scope", title: "Budget & timeline", fields: ["budget", "budgetCustom", "timeline"] },
  { id: "extras", title: "Inspiration & files", fields: ["inspiration", "files", "additionalInfo"] },
  { id: "review", title: "Review", fields: [] },
] as const;

const stepOfField = (field: string) => steps.findIndex((s) => (s.fields as readonly string[]).includes(field));

export function ProjectBriefForm({ signedIn, defaults, draftRef, existingFileCount = 0 }: Props) {
  const [state, dispatch] = useActionState<ProjectFormState, FormData>(submitProjectRequest, {});
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [clientErrors, setClientErrors] = useState<Record<string, string[]>>({});
  const [projectType, setProjectType] = useState(defaults.projectType ?? "");
  const [budget, setBudget] = useState(defaults.budget ?? "");
  const [timeline, setTimeline] = useState(defaults.timeline ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const lenis = useLenis();

  const errors: Record<string, string[] | undefined> = { ...state.fieldErrors, ...clientErrors };

  const scrollToTop = () => {
    const el = topRef.current;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -110, duration: 0.9 });
    else el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Restore unsent answers (e.g. after logging in mid-brief). Drafts from the server win.
  useEffect(() => {
    if (draftRef) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, string> | null;
      const form = formRef.current;
      if (!saved || !form) return;
      for (const [name, value] of Object.entries(saved)) {
        const el = form.elements.namedItem(name);
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (!el.value) el.value = value;
        }
      }
      /* eslint-disable react-hooks/set-state-in-effect -- syncing restored values into controlled radios */
      if (saved.projectType) setProjectType(saved.projectType);
      if (saved.budget) setBudget(saved.budget);
      if (saved.timeline) setTimeline(saved.timeline);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // Storage unavailable — nothing to restore.
    }
  }, [draftRef]);

  const persist = () => {
    const form = formRef.current;
    if (!form || draftRef) return;
    const data: Record<string, string> = {};
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string" && k !== "accountPassword" && v) data[k] = v;
    });
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Private mode or quota — autosave is a convenience only.
    }
  };

  // When the server rejects the brief, jump to the first step with a problem.
  const [handledState, setHandledState] = useState(state);
  if (handledState !== state) {
    setHandledState(state);
    const first = Object.keys(state.fieldErrors ?? {})
      .map(stepOfField)
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    if (first !== undefined) setStep(first);
  }
  useEffect(() => {
    if (state.ok) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    if (state.fieldErrors || state.message || state.ok) scrollToTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Validates the inputs of one step with the browser's constraint API. */
  const validateStep = (index: number) => {
    const container = formRef.current?.querySelector<HTMLElement>(`[data-step="${index}"]`);
    if (!container) return true;
    const next: Record<string, string[]> = {};
    let firstInvalid: HTMLElement | null = null;
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]").forEach((el) => {
      if (el.type === "file" || next[el.name]) return;
      if (!el.checkValidity()) {
        next[el.name] = [
          el.validity.valueMissing
            ? el.type === "radio"
              ? "Please choose an option."
              : "This field is required."
            : el.validity.tooShort
              ? `Please write at least ${el.minLength} characters.`
              : el.validity.typeMismatch
                ? "Please enter a valid email address."
                : el.validationMessage,
        ];
        firstInvalid ??= el;
      }
    });
    setClientErrors((prev) => {
      const cleaned = { ...prev };
      steps[index]!.fields.forEach((f) => delete cleaned[f]);
      return { ...cleaned, ...next };
    });
    if (firstInvalid) {
      (firstInvalid as HTMLElement).focus({ preventScroll: false });
      return false;
    }
    return true;
  };

  const goTo = (index: number) => {
    if (index > step) {
      for (let i = step; i < index; i++) {
        if (!validateStep(i)) {
          setStep(i);
          return;
        }
      }
    }
    persist();
    if (index === steps.length - 1 && formRef.current) {
      const data: Record<string, string> = {};
      new FormData(formRef.current).forEach((v, k) => {
        if (typeof v === "string") data[k] = v;
      });
      setReview(data);
    }
    setStep(index);
    scrollToTop();
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`[data-step="${index}"] h2`)?.focus();
    });
  };

  const submit = (intent: "submit" | "draft") => {
    const form = formRef.current;
    if (!form) return;
    if (intent === "draft") {
      const title = form.elements.namedItem("title") as HTMLInputElement | null;
      if (!title?.value.trim()) {
        setClientErrors((e) => ({ ...e, title: ["Give your project a name before saving a draft."] }));
        setStep(1);
        requestAnimationFrame(() => title?.focus());
        return;
      }
    } else {
      for (let i = 0; i < steps.length - 1; i++) {
        if (!validateStep(i)) {
          setStep(i);
          return;
        }
      }
    }
    const fd = new FormData(form);
    fd.delete("files");
    files.forEach((f) => fd.append("files", f));
    fd.set("intent", intent);
    startTransition(() => dispatch(fd));
  };

  const clearError = (name: string) =>
    setClientErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

  if (state.ok && state.reference) {
    return (
      <div ref={topRef}>
        <SuccessPanel reference={state.reference} name={review.contactName ?? defaults.contactName} />
      </div>
    );
  }

  const d = defaults;

  return (
    <div ref={topRef} className="grid scroll-mt-28 gap-10 lg:grid-cols-12">
      {/* ── Progress ─────────────────────── */}
      <aside className="lg:col-span-3">
        <div className="lg:sticky lg:top-28">
          <p className="eyebrow mb-3 lg:hidden">
            Step {step + 1} of {steps.length} — {steps[step]!.title}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-line lg:hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-flux transition-[width] duration-700 ease-(--ease-out-expo)" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <nav aria-label="Brief steps" className="hidden lg:block">
            <ol className="space-y-1">
              {steps.map((s, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "group flex w-full items-center gap-4 rounded-md px-3 py-3 text-left text-sm transition-colors",
                        current ? "bg-fog-50/[0.05] text-fog-50" : "text-fog-400 hover:text-fog-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-2xs transition-colors",
                          current && "border-flux text-flux",
                          done && "border-flux bg-flux text-ink-950",
                          !current && !done && "border-line-strong",
                        )}
                      >
                        {done ? <Check size={13} strokeWidth={2.4} /> : String(i + 1).padStart(2, "0")}
                      </span>
                      {s.title}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          {!signedIn && (
            <p className="mt-8 hidden text-sm leading-relaxed text-fog-500 lg:block">
              Already a client?{" "}
              <Link href="/login?next=/start-project" className="text-fog-200 underline-offset-4 hover:underline" onClick={persist}>
                Log in
              </Link>{" "}
              — your answers are kept.
            </p>
          )}
        </div>
      </aside>

      {/* ── Form ─────────────────────────── */}
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < steps.length - 1) goTo(step + 1);
          else submit("submit");
        }}
        onChange={(e) => {
          const target = e.target as unknown as HTMLInputElement;
          if (target.name) clearError(target.name);
        }}
        className="lg:col-span-9"
      >
        {draftRef && <input type="hidden" name="draftRef" value={draftRef} />}
        {state.message && !state.ok && (
          <div className="mb-8">
            <FormMessage>{state.message}</FormMessage>
          </div>
        )}

        {/* Step 1 — client information */}
        <Step index={0} current={step} title="First, tell us about you." lead="We'll use these details to contact you about your project.">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="contactName" label="Full name" error={errors.contactName}>
              {(a) => <Input {...a} name="contactName" autoComplete="name" required minLength={2} maxLength={80} defaultValue={d.contactName} />}
            </Field>
            <Field id="contactEmail" label="Email" error={errors.contactEmail}>
              {(a) => (
                <Input
                  {...a}
                  name="contactEmail"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={d.contactEmail}
                />
              )}
            </Field>
            <Field id="contactPhone" label="Phone" optional error={errors.contactPhone}>
              {(a) => <Input {...a} name="contactPhone" type="tel" autoComplete="tel" maxLength={40} defaultValue={d.contactPhone} />}
            </Field>
            <Field id="contactCompany" label="Company" optional error={errors.contactCompany}>
              {(a) => <Input {...a} name="contactCompany" autoComplete="organization" maxLength={120} defaultValue={d.contactCompany} />}
            </Field>
            <Field id="contactCountry" label="Country" optional error={errors.contactCountry} className="sm:col-span-2">
              {(a) => <Input {...a} name="contactCountry" autoComplete="country-name" maxLength={80} defaultValue={d.contactCountry} />}
            </Field>
          </div>
          {!signedIn && (
            <div className="mt-10 rounded-lg border border-line bg-ink-900/60 p-6">
              <p className="font-medium text-fog-50">Create your client account</p>
              <p className="mt-1 text-sm leading-relaxed text-fog-400">
                Choose a password so you can track this request in your dashboard. Already have an account?{" "}
                <Link href="/login?next=/start-project" onClick={persist} className="text-flux underline-offset-4 hover:underline">
                  Log in
                </Link>
                .
              </p>
              <Field id="accountPassword" label="Password" hint="At least 10 characters." error={errors.accountPassword} className="mt-5 max-w-sm">
                {(a) => <Input {...a} name="accountPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />}
              </Field>
            </div>
          )}
        </Step>

        {/* Step 2 — project */}
        <Step index={1} current={step} title="What do you want us to build?" lead="Give it a working name and describe the idea in your own words.">
          <div className="space-y-8">
            <Field id="title" label="Project name" hint="A working title is fine — e.g. “Restaurant Mobile App”." error={errors.title}>
              {(a) => <Input {...a} name="title" required minLength={2} maxLength={120} defaultValue={d.title} />}
            </Field>
            <OptionCards
              name="projectType"
              legend="Project type"
              options={projectTypes}
              value={projectType}
              onChange={(v) => {
                setProjectType(v);
                clearError("projectType");
              }}
              error={errors.projectType}
            />
            {projectType === "OTHER" && (
              <Field id="otherType" label="What kind of project is it?" error={errors.otherType}>
                {(a) => <Input {...a} name="otherType" required maxLength={120} defaultValue={d.otherType} />}
              </Field>
            )}
            <Field
              id="description"
              label="Project description"
              hint="What should it do? What problem does it solve? At least 20 characters."
              error={errors.description}
            >
              {(a) => <Textarea {...a} name="description" rows={8} required minLength={20} maxLength={8000} defaultValue={d.description} />}
            </Field>
          </div>
        </Step>

        {/* Step 3 — context */}
        <Step index={2} current={step} title="Tell us about the context." lead="The more we understand, the better our first conversation will be. Skip anything you're unsure about.">
          <div className="space-y-8">
            <Field id="business" label="Tell us about your business or idea" optional error={errors.business}>
              {(a) => <Textarea {...a} name="business" rows={5} maxLength={5000} defaultValue={d.business} />}
            </Field>
            <Field id="targetUsers" label="Who will use this product?" optional error={errors.targetUsers}>
              {(a) => <Textarea {...a} name="targetUsers" rows={4} maxLength={3000} defaultValue={d.targetUsers} />}
            </Field>
            <Field id="features" label="Which features do you need?" hint="A rough list is perfect — one per line." optional error={errors.features}>
              {(a) => (
                <Textarea
                  {...a}
                  name="features"
                  rows={6}
                  maxLength={8000}
                  defaultValue={d.features}
                  placeholder={"Online booking\nCustomer accounts\nPayments"}
                />
              )}
            </Field>
          </div>
        </Step>

        {/* Step 4 — budget & timeline */}
        <Step index={3} current={step} title="Budget and timeline." lead="Ranges help us suggest the right approach. There are no wrong answers.">
          <div className="space-y-10">
            <OptionCards
              name="budget"
              legend="Budget"
              options={budgetRanges}
              value={budget}
              onChange={(v) => {
                setBudget(v);
                clearError("budget");
              }}
              error={errors.budget}
              variant="chip"
            />
            {budget === "custom" && (
              <Field id="budgetCustom" label="Your budget" hint="e.g. “$25,000” or “€3,000 per month”." error={errors.budgetCustom} className="max-w-sm">
                {(a) => <Input {...a} name="budgetCustom" required maxLength={120} defaultValue={d.budgetCustom} />}
              </Field>
            )}
            <OptionCards
              name="timeline"
              legend="Timeline"
              options={timelines}
              value={timeline}
              onChange={(v) => {
                setTimeline(v);
                clearError("timeline");
              }}
              error={errors.timeline}
              variant="chip"
            />
          </div>
        </Step>

        {/* Step 5 — extras */}
        <Step index={4} current={step} title="Anything else we should see?" lead="Share references you like and any documents that help explain the project.">
          <div className="space-y-8">
            <Field id="inspiration" label="Inspiration" hint="Links to websites or apps you like — one per line (up to 10)." optional error={errors.inspiration}>
              {(a) => (
                <Textarea
                  {...a}
                  name="inspiration"
                  rows={4}
                  maxLength={3000}
                  defaultValue={d.inspiration}
                  placeholder={"https://example.com\nhttps://another-example.com"}
                />
              )}
            </Field>
            <FileDrop files={files} onChange={setFiles} error={errors.files} existingCount={existingFileCount} />
            {existingFileCount > 0 && (
              <p className="text-xs text-fog-500">{existingFileCount} file(s) already attached to this draft.</p>
            )}
            <Field id="additionalInfo" label="Additional information" optional error={errors.additionalInfo}>
              {(a) => <Textarea {...a} name="additionalInfo" rows={4} maxLength={5000} defaultValue={d.additionalInfo} />}
            </Field>
          </div>
        </Step>

        {/* Step 6 — review */}
        <Step index={5} current={step} title="Review your brief." lead="Check everything looks right, then send it to the MovEra team.">
          <dl className="divide-y divide-line border-y border-line">
            {[
              { k: "Name", v: review.contactName, s: 0 },
              { k: "Email", v: review.contactEmail, s: 0 },
              { k: "Company", v: review.contactCompany, s: 0 },
              { k: "Project", v: review.title, s: 1 },
              {
                k: "Type",
                v: projectType === "OTHER" ? `Other — ${review.otherType ?? ""}` : labelFor.projectType(projectType),
                s: 1,
              },
              { k: "Description", v: review.description, s: 1, long: true },
              { k: "Business", v: review.business, s: 2, long: true },
              { k: "Target users", v: review.targetUsers, s: 2, long: true },
              { k: "Features", v: review.features, s: 2, long: true },
              { k: "Budget", v: budget === "custom" ? review.budgetCustom : labelFor.budget(budget), s: 3 },
              { k: "Timeline", v: labelFor.timeline(timeline), s: 3 },
              { k: "Inspiration", v: review.inspiration, s: 4, long: true },
              { k: "Files", v: files.length ? files.map((f) => f.name).join(", ") : undefined, s: 4 },
              { k: "Additional info", v: review.additionalInfo, s: 4, long: true },
            ].map((row) => (
              <div key={row.k} className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-6">
                <dt className="eyebrow pt-0.5 sm:col-span-3">{row.k}</dt>
                <dd className={cn("text-sm text-fog-50 sm:col-span-7", row.long && "whitespace-pre-line leading-relaxed", !row.v && "text-fog-500")}>
                  {row.v?.trim() ? row.v : "—"}
                </dd>
                <div className="sm:col-span-2 sm:text-right">
                  <button type="button" onClick={() => goTo(row.s)} className="text-xs text-fog-400 underline-offset-4 hover:text-flux hover:underline">
                    Edit<span className="sr-only"> {row.k}</span>
                  </button>
                </div>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs leading-relaxed text-fog-500">
            By sending this brief you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-fog-200">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-fog-200">
              Privacy Policy
            </Link>
            .
          </p>
        </Step>

        {/* ── Controls ─────────────────────── */}
        <div className="mt-12 flex flex-col-reverse gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={pending}>
                <ArrowLeft size={16} /> Back
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => submit("draft")} disabled={pending} className="text-fog-400">
              Save draft
            </Button>
          </div>
          {step < steps.length - 1 ? (
            <Button type="submit" arrow size="lg" disabled={pending}>
              Continue
            </Button>
          ) : (
            <Button type="submit" arrow size="lg" pending={pending}>
              {pending ? "Sending your brief" : "Send project brief"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Step({
  index,
  current,
  title,
  lead,
  children,
}: {
  index: number;
  current: number;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  const active = index === current;
  return (
    <section data-step={index} hidden={!active} aria-labelledby={`step-${index}-title`} className="animate-step-in">
      <p className="eyebrow mb-4 text-flux">
        {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
      </p>
      <h2 id={`step-${index}-title`} tabIndex={-1} className="text-display-md font-medium outline-none">
        {title}
      </h2>
      <p className="mb-10 mt-4 max-w-2xl leading-relaxed text-fog-400">{lead}</p>
      {children}
    </section>
  );
}
