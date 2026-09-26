"use client";

import type { Service } from "@prisma/client";
import { useActionState } from "react";
import { saveServiceAction } from "@/actions/admin";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/dashboard/page-header";

export function ServiceForm({ service }: { service: Service }) {
  const [state, action, pending] = useActionState(saveServiceAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const val = (k: keyof Service) => {
    if (v[k] !== undefined) return v[k];
    const raw = service[k];
    return Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
  };
  return (
    <form action={action} noValidate>
      <input type="hidden" name="id" value={service.id} />
      <Panel>
        <div className="grid gap-6 p-5 md:grid-cols-2">
          {state.message && (
            <div className="md:col-span-2">
              <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>
            </div>
          )}
          <Field id="title" label="Title" error={e.title}>
            {(a) => <Input {...a} name="title" required defaultValue={val("title")} />}
          </Field>
          <Field id="shortTitle" label="Short title" error={e.shortTitle}>
            {(a) => <Input {...a} name="shortTitle" required defaultValue={val("shortTitle")} />}
          </Field>
          <Field id="tagline" label="Tagline" className="md:col-span-2" error={e.tagline}>
            {(a) => <Input {...a} name="tagline" required defaultValue={val("tagline")} />}
          </Field>
          <Field id="description" label="Description" className="md:col-span-2" error={e.description}>
            {(a) => <Textarea {...a} name="description" rows={4} required defaultValue={val("description")} />}
          </Field>
          <Field id="audience" label="Who it's for" className="md:col-span-2" error={e.audience}>
            {(a) => <Textarea {...a} name="audience" rows={3} required defaultValue={val("audience")} />}
          </Field>
          <Field id="capabilities" label="Capabilities" hint="One per line" error={e.capabilities}>
            {(a) => <Textarea {...a} name="capabilities" rows={6} defaultValue={val("capabilities")} />}
          </Field>
          <Field id="benefits" label="Benefits" hint="One per line" error={e.benefits}>
            {(a) => <Textarea {...a} name="benefits" rows={6} defaultValue={val("benefits")} />}
          </Field>
          <Field id="technologies" label="Technologies" hint="One per line" error={e.technologies}>
            {(a) => <Textarea {...a} name="technologies" rows={6} defaultValue={val("technologies")} />}
          </Field>
          <div className="space-y-6">
            <Field id="sortOrder" label="Sort order" error={e.sortOrder}>
              {(a) => <Input {...a} name="sortOrder" type="number" required defaultValue={val("sortOrder")} />}
            </Field>
            <Checkbox name="published" defaultChecked={service.published} label="Published on the website" />
          </div>
          <div className="flex justify-end md:col-span-2">
            <Button type="submit" pending={pending}>
              Save service
            </Button>
          </div>
        </div>
      </Panel>
    </form>
  );
}
