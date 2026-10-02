"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { PasswordInput } from "./password-input";
import { useT } from "@/i18n/client";

export function LoginForm({ next }: { next?: string }) {
  const t = useT().auth;
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label={t.email} error={e.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} autoFocus />}
      </Field>
      <Field id="password" label={t.password} error={e.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="current-password" required />}
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-fog-400 underline-offset-4 hover:text-fog-50 hover:underline">
          {t.forgotLink}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? t.signingIn : t.logIn}
      </Button>
    </form>
  );
}
