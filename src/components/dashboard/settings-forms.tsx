"use client";

import { useActionState } from "react";
import { changePasswordAction, deleteAccountAction } from "@/actions/account";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/auth/password-input";
import { useT } from "@/i18n/client";

export function ChangePasswordForm() {
  const t = useT().dashboard.settings;
  const [state, action, pending] = useActionState(changePasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6 p-5 md:p-6" noValidate>
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="currentPassword" label={t.current} error={e.currentPassword}>
          {(a) => <PasswordInput {...a} name="currentPassword" autoComplete="current-password" required />}
        </Field>
        <Field id="newPassword" label={t.newPassword} hint={t.newHint} error={e.newPassword}>
          {(a) => <PasswordInput {...a} name="newPassword" autoComplete="new-password" required minLength={10} />}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          {pending ? t.updating : t.update}
        </Button>
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const t = useT().dashboard.settings;
  const [state, action, pending] = useActionState(deleteAccountAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6 p-5 md:p-6" noValidate>
      <p className="text-sm leading-relaxed text-fog-400">
        {t.deleteBody}
      </p>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="delete-password" label={t.deletePassword} error={e.password}>
          {(a) => <PasswordInput {...a} name="password" autoComplete="current-password" required />}
        </Field>
        <Field id="confirm" label={t.confirm} error={e.confirm}>
          {(a) => <Input {...a} name="confirm" autoComplete="off" required />}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="danger" pending={pending}>
          {t.deleteButton}
        </Button>
      </div>
    </form>
  );
}
