"use client";

import type { ProjectFile, ProjectRequest } from "@prisma/client";
import { fmt } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { formatBytes } from "@/lib/utils";
import { Download, FileIcon } from "@/components/ui/icons";
import { Panel } from "./page-header";

/** Read-only rendering of a submitted brief. All values render as text (never HTML). */
export function BriefDetails({ request, files }: { request: ProjectRequest; files: ProjectFile[] }) {
  const dict = useT();
  const t = dict.dashboard.brief;
  const o = dict.options;
  const budget = request.budget && request.budget in o.budgets ? o.budgets[request.budget as keyof typeof o.budgets] : "—";
  const timeline = request.timeline && request.timeline in o.timelines ? o.timelines[request.timeline as keyof typeof o.timelines] : "—";
  const facts = [
    {
      k: t.projectType,
      v: request.projectType === "OTHER" ? fmt(dict.brief.review.other, { value: request.otherType ?? "" }) : o.projectTypes[request.projectType].label,
    },
    { k: t.budget, v: request.budget === "custom" ? (request.budgetCustom ?? t.custom) : budget },
    { k: t.timeline, v: timeline },
    { k: t.reference, v: request.reference, mono: true },
  ];
  const sections = [
    { k: t.what, v: request.description },
    { k: t.business, v: request.business },
    { k: t.targetUsers, v: request.targetUsers },
    { k: t.features, v: request.features },
    { k: t.additional, v: request.additionalInfo },
  ].filter((s) => s.v);
  const contact = [
    { k: t.name, v: request.contactName },
    { k: t.email, v: request.contactEmail },
    { k: t.phone, v: request.contactPhone },
    { k: t.company, v: request.contactCompany },
    { k: t.country, v: request.contactCountry },
  ].filter((c) => c.v);

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {facts.map((f) => (
          <div key={f.k} className="bg-ink-900 p-5">
            <dt className="text-xs text-fog-500">{f.k}</dt>
            <dd className={`mt-2 text-sm text-fog-50 ${f.mono ? "font-mono tracking-[0.05em]" : ""}`}>{f.v}</dd>
          </div>
        ))}
      </dl>

      <Panel title={t.brief}>
        <div className="divide-y divide-line">
          {sections.map((s) => (
            <div key={s.k} className="grid gap-2 px-5 py-5 md:grid-cols-12 md:gap-6">
              <h3 className="text-sm text-fog-500 md:col-span-4">{s.k}</h3>
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-fog-50 md:col-span-8">{s.v}</p>
            </div>
          ))}
          {request.inspiration.length > 0 && (
            <div className="grid gap-2 px-5 py-5 md:grid-cols-12 md:gap-6">
              <h3 className="text-sm text-fog-500 md:col-span-4">{t.inspiration}</h3>
              <ul className="space-y-1.5 md:col-span-8">
                {request.inspiration.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-sm text-ion-soft underline-offset-4 hover:underline">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-8 md:grid-cols-2">
        <Panel title={t.contact}>
          <dl className="divide-y divide-line">
            {contact.map((c) => (
              <div key={c.k} className="flex justify-between gap-4 px-5 py-3 text-sm">
                <dt className="text-fog-500">{c.k}</dt>
                <dd className="truncate text-right text-fog-50">{c.v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={fmt(t.files, { count: files.length })}>
          {files.length ? (
            <ul className="divide-y divide-line">
              {files.map((f) => (
                <li key={f.id}>
                  <a href={`/api/files/${f.id}`} className="group flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-fog-50/[0.03]">
                    <FileIcon size={16} className="shrink-0 text-fog-400" />
                    <span className="min-w-0 flex-1 truncate text-fog-50">{f.originalName}</span>
                    <span className="font-mono text-2xs text-fog-500">{formatBytes(f.size)}</span>
                    <Download size={16} className="text-fog-500 transition-colors group-hover:text-flux" />
                    <span className="sr-only">{t.download}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-fog-500">{t.noFiles}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
