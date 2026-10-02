"use client";

import type { ApplicationStatus } from "@prisma/client";
import { useActionState } from "react";
import { updateApplicationAction } from "@/actions/admin-careers";
import { en } from "@/i18n/dictionaries/en";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Select, Textarea } from "@/components/ui/field";

export function ApplicationStatusForm({ id, status, notes }: { id: string; status: ApplicationStatus; notes: string | null }) {
  const [state, action, pending] = useActionState(updateApplicationAction, initialFormState);
  return (
    <form action={action} className="space-y-5 p-5">
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
      <input type="hidden" name="id" value={id} />
      <Field id="app-status" label="Status">
        {(a) => (
          <Select {...a} name="status" defaultValue={status}>
            {(Object.keys(en.options.applicationStatuses) as ApplicationStatus[]).map((s) => (
              <option key={s} value={s}>
                {en.options.applicationStatuses[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="app-notes" label="Internal notes" optional hint="Only visible to the MovEra team.">
        {(a) => <Textarea {...a} name="adminNotes" rows={5} maxLength={8000} defaultValue={notes ?? ""} />}
      </Field>
      <Button type="submit" pending={pending} className="w-full">
        Save
      </Button>
    </form>
  );
}
