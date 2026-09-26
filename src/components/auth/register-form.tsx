"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/actions/auth";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, FormMessage, Input } from "@/components/ui/field";
import { PasswordInput } from "./password-input";

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(registerAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="name" label="Full name" error={e.name}>
        {(a) => <Input {...a} name="name" autoComplete="name" required maxLength={80} defaultValue={v.name} autoFocus />}
      </Field>
      <Field id="email" label="Email" error={e.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={v.email} />}
      </Field>
      <Field id="password" label="Password" hint="At least 10 characters. A short phrase works well." error={e.password}>
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
              I agree to the{" "}
              <Link href="/terms" className="text-fog-50 underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-fog-50 underline underline-offset-2">
                Privacy Policy
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
        {pending ? "Creating account" : "Create account"}
      </Button>
    </form>
  );
}
