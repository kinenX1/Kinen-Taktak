"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/actions/account";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";

type Profile = { name: string; email: string; phone: string | null; company: string | null; country: string | null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6 p-5 md:p-6" noValidate>
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="name" label="Full name" error={e.name}>
          {(a) => <Input {...a} name="name" autoComplete="name" required maxLength={80} defaultValue={v.name ?? profile.name} />}
        </Field>
        <Field id="email" label="Email" hint="Contact us if you need to change your login email.">
          {(a) => <Input {...a} value={profile.email} readOnly disabled />}
        </Field>
        <Field id="phone" label="Phone" optional error={e.phone}>
          {(a) => <Input {...a} name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={v.phone ?? profile.phone ?? ""} />}
        </Field>
        <Field id="company" label="Company" optional error={e.company}>
          {(a) => <Input {...a} name="company" autoComplete="organization" maxLength={120} defaultValue={v.company ?? profile.company ?? ""} />}
        </Field>
        <Field id="country" label="Country" optional error={e.country}>
          {(a) => <Input {...a} name="country" autoComplete="country-name" maxLength={80} defaultValue={v.country ?? profile.country ?? ""} />}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          {pending ? "Saving" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
