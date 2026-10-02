"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState, useId } from "react";
import { subscribeAction } from "@/actions/newsletter";
import { useI18n } from "@/i18n/client";
import { initialFormState } from "@/lib/validation/common";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

/** One-field email capture with an animated beam border. */
export function NewsletterForm({ source = "footer", className }: { source?: "footer" | "careers"; className?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(subscribeAction, initialFormState);
  const id = useId();

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {state.ok ? (
          <motion.p
            key="ok"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ease.outExpo }}
            className="flex min-h-14 items-center gap-3 rounded-full border border-success/30 bg-success/[0.07] px-5 text-sm text-[#a6f0cd]"
          >
            <Check size={16} /> {state.message}
          </motion.p>
        ) : (
          <motion.form key="form" action={action} exit={{ opacity: 0, y: -6 }} noValidate>
            <input type="hidden" name="source" value={source} />
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor={`${id}-website`}>Website</label>
              <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <label htmlFor={`${id}-email`} className="sr-only">
              {t.newsletter.label}
            </label>
            <div className="beam-border relative flex h-14 items-center rounded-full bg-ink-900 p-1.5 pl-5">
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                size={1}
                required
                autoComplete="email"
                defaultValue={state.values?.email}
                placeholder={t.newsletter.placeholder}
                aria-invalid={state.message ? true : undefined}
                aria-describedby={state.message ? `${id}-error` : undefined}
                className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-fog-50 placeholder:text-fog-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className={cn(
                  "group flex h-11 shrink-0 items-center gap-2 rounded-full bg-flux px-5 text-sm font-medium text-ink-950 transition-[background-color,box-shadow] duration-300 hover:bg-flux-soft hover:shadow-[var(--glow-flux)]",
                  pending && "opacity-70",
                )}
              >
                {pending ? <Spinner /> : null}
                {t.newsletter.submit}
                {!pending && <ArrowRight size={15} className="transition-transform duration-500 group-hover:translate-x-0.5" />}
              </button>
            </div>
            {state.message && (
              <p id={`${id}-error`} role="alert" className="mt-2 pl-5 text-xs text-danger">
                {state.message}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
