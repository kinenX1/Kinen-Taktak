"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/actions/auth";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { useT } from "@/i18n/client";

export function ForgotForm() {
  const t = useT().auth;
  const [state, action, pending] = useActionState(forgotPasswordAction, initialFormState);
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      <Field id="email" label={t.email} error={state.fieldErrors?.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? `${t.sendLink}…` : t.sendLink}
      </Button>
    </form>
  );
}
