"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/actions/auth";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, FormMessage, Input } from "@/components/ui/field";
import { PasswordInput } from "./password-input";
import { useT } from "@/i18n/client";

export function RegisterForm({ next }: { next?: string }) {
  const dict = useT();
  const t = dict.auth;
  const [state, action, pending] = useActionState(registerAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="name" label={t.fullName} error={e.name}>
        {(a) => <Input {...a} name="name" autoComplete="name" required maxLength={80} defaultValue={v.name} autoFocus />}
      </Field>
      <Field id="email" label={t.email} error={e.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={v.email} />}
      </Field>
      <Field id="password" label={t.password} hint={t.passwordHint} error={e.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="new-password" required minLength={10} maxLength={128} />}
      </Field>
      <div>
        <Checkbox
          name="terms"
          required
          defaultChecked={v.terms === "on"}
          aria-invalid={e.terms ? true : undefined}
          aria-describedby={e.terms ? "terms-error" : undefined}
          label={
            <>
              {t.agree}{" "}
              <Link href="/terms" className="text-fog-50 underline underline-offset-2">
                {t.termsLink}
              </Link>{" "}
              {dict.common.and}{" "}
              <Link href="/privacy" className="text-fog-50 underline underline-offset-2">
                {t.privacyLink}
              </Link>
              .
            </>
          }
        />
        <div className="mt-2">
          <FieldError id="terms-error" errors={e.terms} />
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? t.creating : t.createAccount}
      </Button>
    </form>
  );
}
