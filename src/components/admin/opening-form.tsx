"use client";

import type { JobOpening } from "@prisma/client";
import { useActionState } from "react";
import { saveOpeningAction } from "@/actions/admin-careers";
import { en } from "@/i18n/dictionaries/en";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/dashboard/page-header";

export function OpeningForm({ opening }: { opening?: JobOpening }) {
  const [state, action, pending] = useActionState(saveOpeningAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const val = (k: keyof JobOpening, fallback = "") => {
    if (v[k] !== undefined) return v[k];
    const raw = opening?.[k];
    if (Array.isArray(raw)) return raw.join("\n");
    return raw === null || raw === undefined ? fallback : String(raw);
  };

  return (
    <form action={action} className="space-y-8" noValidate>
      {opening && <input type="hidden" name="id" value={opening.id} />}
      {state.message && <FormMessage>{state.message}</FormMessage>}
      <Panel title="Role">
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <Field id="title" label="Title" error={e.title}>
            {(a) => <Input {...a} name="title" required defaultValue={val("title")} />}
          </Field>
          <Field id="slug" label="URL slug" hint="Used in /careers/your-slug" error={e.slug}>
            {(a) => <Input {...a} name="slug" required defaultValue={val("slug")} />}
          </Field>
          <Field id="team" label="Team" hint="e.g. Engineering, Design, Marketing" error={e.team}>
            {(a) => <Input {...a} name="team" required defaultValue={val("team")} />}
          </Field>
          <Field id="location" label="Location" hint='e.g. "Remote" or "Paris, France"' error={e.location}>
            {(a) => <Input {...a} name="location" required defaultValue={val("location", "Remote")} />}
          </Field>
          <Field id="employmentType" label="Type" error={e.employmentType}>
            {(a) => (
              <Select {...a} name="employmentType" defaultValue={val("employmentType", "FULL_TIME")}>
                {Object.entries(en.options.employmentTypes).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="workMode" label="Work mode" error={e.workMode}>
            {(a) => (
              <Select {...a} name="workMode" defaultValue={val("workMode", "REMOTE")}>
                {Object.entries(en.options.workModes).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="summary" label="Summary" className="sm:col-span-2" error={e.summary}>
            {(a) => <Textarea {...a} name="summary" rows={3} required maxLength={500} className="min-h-20" defaultValue={val("summary")} />}
          </Field>
        </div>
      </Panel>
      <Panel title="Details">
        <div className="grid gap-6 p-5 md:grid-cols-3">
          <Field id="responsibilities" label="What you'll do" hint="One per line" error={e.responsibilities}>
            {(a) => <Textarea {...a} name="responsibilities" rows={7} defaultValue={val("responsibilities")} />}
          </Field>
          <Field id="requirements" label="What we're looking for" hint="One per line" error={e.requirements}>
            {(a) => <Textarea {...a} name="requirements" rows={7} defaultValue={val("requirements")} />}
          </Field>
          <Field id="niceToHave" label="Nice to have" hint="One per line" optional error={e.niceToHave}>
            {(a) => <Textarea {...a} name="niceToHave" rows={7} defaultValue={val("niceToHave")} />}
          </Field>
        </div>
      </Panel>
      <Panel title="Publishing">
        <div className="flex flex-wrap items-center gap-8 p-5">
          <Field id="sortOrder" label="Sort order" hint="Lower numbers appear first" error={e.sortOrder} className="w-40">
            {(a) => <Input {...a} name="sortOrder" type="number" required defaultValue={val("sortOrder", "0")} />}
          </Field>
          <Checkbox name="published" defaultChecked={opening ? opening.published : true} label="Show on the careers page" />
        </div>
      </Panel>
      <p className="text-xs leading-relaxed text-fog-500">
        Texts are shown exactly as written here in both languages. The default openings have French translations built in until you edit them.
      </p>
      <div className="flex justify-end">
        <Button type="submit" pending={pending} arrow>
          Save opening
        </Button>
      </div>
    </form>
  );
}
