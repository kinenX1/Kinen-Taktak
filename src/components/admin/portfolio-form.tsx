"use client";

import type { PortfolioProject } from "@prisma/client";
import { useActionState, useState } from "react";
import { savePortfolioProjectAction } from "@/actions/admin";
import { categoryLabel } from "@/config/portfolio";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { ProjectVisual } from "@/components/visuals/project-visual";
import { Panel } from "@/components/dashboard/page-header";

const variants = ["BROWSER", "PHONE", "DASHBOARD", "COMMERCE", "SYSTEM"] as const;

export function PortfolioForm({ project }: { project?: PortfolioProject }) {
  const [state, action, pending] = useActionState(savePortfolioProjectAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const val = (k: keyof PortfolioProject, fallback = "") => {
    if (v[k] !== undefined) return v[k];
    const raw = project?.[k];
    if (Array.isArray(raw)) return raw.join("\n");
    return raw === null || raw === undefined ? fallback : String(raw);
  };
  const [accent, setAccent] = useState(val("accent", "#FF5A1F"));
  const [variant, setVariant] = useState(val("visualVariant", "BROWSER") as (typeof variants)[number]);
  const [title, setTitle] = useState(val("title"));

  return (
    <form action={action} className="grid gap-8 xl:grid-cols-3" noValidate>
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="space-y-8 xl:col-span-2">
        {state.message && <FormMessage>{state.message}</FormMessage>}
        <Panel title="Basics">
          <div className="grid gap-6 p-5 sm:grid-cols-2">
            <Field id="title" label="Title" error={e.title}>
              {(a) => <Input {...a} name="title" required defaultValue={val("title")} onChange={(ev) => setTitle(ev.target.value)} />}
            </Field>
            <Field id="slug" label="URL slug" hint="Used in /work/your-slug" error={e.slug}>
              {(a) => <Input {...a} name="slug" required defaultValue={val("slug")} />}
            </Field>
            <Field id="category" label="Category" error={e.category}>
              {(a) => (
                <Select {...a} name="category" defaultValue={val("category", "WEBSITE")}>
                  {Object.entries(categoryLabel).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="client" label="Client label" hint='e.g. "Concept — Hospitality" or a real client name' error={e.client}>
              {(a) => <Input {...a} name="client" required defaultValue={val("client")} />}
            </Field>
            <Field id="year" label="Year" error={e.year}>
              {(a) => <Input {...a} name="year" type="number" required defaultValue={val("year", String(new Date().getFullYear()))} />}
            </Field>
            <Field id="sortOrder" label="Sort order" hint="Lower numbers appear first" error={e.sortOrder}>
              {(a) => <Input {...a} name="sortOrder" type="number" required defaultValue={val("sortOrder", "0")} />}
            </Field>
            <Field id="summary" label="Summary" className="sm:col-span-2" error={e.summary}>
              {(a) => <Textarea {...a} name="summary" rows={2} required maxLength={400} className="min-h-20" defaultValue={val("summary")} />}
            </Field>
          </div>
        </Panel>

        <Panel title="Case study">
          <div className="space-y-6 p-5">
            {(["overview", "challenge", "solution", "design", "development"] as const).map((k) => (
              <Field key={k} id={k} label={k[0]!.toUpperCase() + k.slice(1)} error={e[k]}>
                {(a) => <Textarea {...a} name={k} rows={4} required defaultValue={val(k)} />}
              </Field>
            ))}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="results" label="Results / deliverables" hint="One per line. Don't invent metrics." error={e.results}>
                {(a) => <Textarea {...a} name="results" rows={4} defaultValue={val("results")} />}
              </Field>
              <Field id="technologies" label="Technologies" hint="One per line" error={e.technologies}>
                {(a) => <Textarea {...a} name="technologies" rows={4} defaultValue={val("technologies")} />}
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Media">
          <div className="grid gap-6 p-5 sm:grid-cols-2">
            <Field id="coverImage" label="Cover image" optional hint="/images/... or https:// — leave empty to use the generated visual" error={e.coverImage}>
              {(a) => <Input {...a} name="coverImage" defaultValue={val("coverImage")} />}
            </Field>
            <Field id="videoUrl" label="Video URL" optional hint="https:// link to an .mp4/.webm or a video page" error={e.videoUrl}>
              {(a) => <Input {...a} name="videoUrl" defaultValue={val("videoUrl")} />}
            </Field>
            <Field id="gallery" label="Gallery images" optional hint="One path or https:// URL per line" className="sm:col-span-2" error={e.gallery}>
              {(a) => <Textarea {...a} name="gallery" rows={3} defaultValue={val("gallery")} />}
            </Field>
          </div>
        </Panel>
      </div>

      <div className="space-y-8">
        <Panel title="Generated visual">
          <div className="space-y-5 p-5">
            <ProjectVisual variant={variant} accent={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#FF5A1F"} title={title || "Preview"} className="aspect-[4/3] rounded-md" />
            <Field id="visualVariant" label="Composition" error={e.visualVariant}>
              {(a) => (
                <Select {...a} name="visualVariant" value={variant} onChange={(ev) => setVariant(ev.target.value as typeof variant)}>
                  {variants.map((x) => (
                    <option key={x} value={x}>
                      {x[0] + x.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="accent" label="Accent colour" error={e.accent}>
              {(a) => (
                <div className="flex gap-3">
                  <input
                    type="color"
                    aria-label="Pick accent colour"
                    value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#ff5a1f"}
                    onChange={(ev) => setAccent(ev.target.value)}
                    className="h-12 w-14 cursor-pointer rounded-md border border-line bg-transparent p-1"
                  />
                  <Input {...a} name="accent" value={accent} onChange={(ev) => setAccent(ev.target.value)} />
                </div>
              )}
            </Field>
          </div>
        </Panel>
        <Panel title="Publishing">
          <div className="space-y-4 p-5">
            <Checkbox name="published" defaultChecked={project ? project.published : true} label="Published on the website" />
            <Checkbox name="featured" defaultChecked={project?.featured} label="Featured on the home page" />
            <Checkbox name="isDemo" defaultChecked={project ? project.isDemo : true} label='Concept / demo project (shows a "Concept" label)' />
            <Button type="submit" pending={pending} className="mt-2 w-full">
              {project ? "Save changes" : "Create project"}
            </Button>
          </div>
        </Panel>
      </div>
    </form>
  );
}
