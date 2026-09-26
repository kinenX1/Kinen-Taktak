"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/actions/auth";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { PasswordInput } from "./password-input";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.message && (
        <FormMessage>
          {state.message}{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new link
          </Link>
        </FormMessage>
      )}
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" hint="At least 10 characters." error={state.fieldErrors?.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="new-password" required minLength={10} maxLength={128} autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? "Saving" : "Set new password"}
      </Button>
    </form>
  );
}
