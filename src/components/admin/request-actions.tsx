"use client";

import type { RequestStatus } from "@prisma/client";
import { useActionState, useState } from "react";
import { addNoteAction, changeStatusAction } from "@/actions/admin";
import { requestStatuses } from "@/config/project-brief";
import { initialFormState } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Select, Textarea } from "@/components/ui/field";

export function StatusForm({ requestId, status }: { requestId: string; status: RequestStatus }) {
  const [state, action, pending] = useActionState(changeStatusAction, initialFormState);
  return (
    <form action={action} className="space-y-5 p-5">
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
      <input type="hidden" name="requestId" value={requestId} />
      <Field id="status" label="Status" error={state.fieldErrors?.status}>
        {(a) => (
          <Select {...a} name="status" defaultValue={status}>
            {requestStatuses
              .filter((s) => s.value !== "DRAFT")
              .map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Field id="status-note" label="Message to the client" optional error={state.fieldErrors?.note}>
        {(a) => <Textarea {...a} name="note" rows={3} maxLength={4000} className="min-h-24" placeholder="Shown on the client's dashboard" />}
      </Field>
      <Checkbox name="notifyClient" defaultChecked label="Email the client about this change" />
      <Button type="submit" pending={pending} className="w-full">
        Update status
      </Button>
    </form>
  );
}

export function NoteForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(addNoteAction, initialFormState);
  const [visibility, setVisibility] = useState<"INTERNAL" | "CLIENT">("INTERNAL");
  return (
    <form action={action} className="space-y-4 p-5">
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="visibility" value={visibility} />
      <div role="radiogroup" aria-label="Note visibility" className="grid grid-cols-2 gap-1 rounded-full border border-line p-1 text-sm">
        {(["INTERNAL", "CLIENT"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={visibility === v}
            onClick={() => setVisibility(v)}
            className={cn("h-9 rounded-full transition-colors", visibility === v ? "bg-fog-50 text-ink-950" : "text-fog-400 hover:text-fog-50")}
          >
            {v === "INTERNAL" ? "Internal note" : "Client update"}
          </button>
        ))}
      </div>
      <Field id="note-body" label={visibility === "INTERNAL" ? "Visible to admins only" : "Visible to the client"} error={state.fieldErrors?.body}>
        {(a) => <Textarea {...a} name="body" rows={4} required maxLength={4000} defaultValue={state.ok ? "" : state.values?.body} />}
      </Field>
      <Button type="submit" pending={pending} variant="secondary" className="w-full">
        {visibility === "INTERNAL" ? "Add internal note" : "Share update"}
      </Button>
    </form>
  );
}
