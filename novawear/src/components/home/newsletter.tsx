"use client";

import { useActionState } from "react";
import { subscribeAction } from "@/actions/order";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function Newsletter() {
  const [state, action, pending] = useActionState(subscribeAction, initialFormState);
  return (
    <section aria-labelledby="join-title" className="print animate-drift bg-leopard px-[var(--gutter)] py-[clamp(3rem,7vw,6.25rem)]">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-end justify-between gap-7 bg-ink p-[clamp(1.75rem,5vw,4rem)] text-bone">
        <div className="flex-[1_1_320px]">
          <h2 id="join-title" className="display text-[clamp(3.5rem,7vw,6.25rem)]">
            Join the pack
          </h2>
          <p className="mt-3.5 text-base leading-relaxed text-fog">First call on every drop and every pre-order window.</p>
        </div>
        <div className="flex-[1_1_320px]">
          {state.ok ? (
            <p role="status" className="label text-2xl text-leopard">
              {state.message}
            </p>
          ) : (
            <form action={action} noValidate>
              <label htmlFor="join-email" className="eyebrow mb-2 block text-fog">
                Email
              </label>
              <div className="flex gap-2">
                <input
                  id="join-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@email.com"
                  defaultValue={state.values?.email}
                  aria-invalid={state.fieldErrors?.email ? true : undefined}
                  aria-describedby={state.fieldErrors?.email ? "join-error" : undefined}
                  className="h-13 min-w-0 flex-1 border-[1.5px] border-muted bg-transparent px-4 text-base text-bone placeholder:text-fog-2 focus:border-leopard focus:outline-none"
                />
                <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                <Button type="submit" variant="leopard" size="md" pending={pending} className="h-13">
                  Join
                </Button>
              </div>
              <FieldError id="join-error" errors={state.fieldErrors?.email} />
              {state.message && !state.ok && <p className="mt-2 text-sm text-leopard">{state.message}</p>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
