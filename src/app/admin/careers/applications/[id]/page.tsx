import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteApplicationAction } from "@/actions/admin-careers";
import { experienceKey } from "@/config/careers";
import { getApplication } from "@/lib/data/admin";
import { en } from "@/i18n/dictionaries/en";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { buttonClasses } from "@/components/ui/button";
import { ArrowLeft, ArrowUpRight, Download, FileIcon, Mail } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ApplicationBadge } from "@/components/admin/application-badge";
import { ApplicationStatusForm } from "@/components/admin/application-actions";
import { EmailComposer } from "@/components/admin/email-composer";
import { EmailHistory } from "@/components/admin/email-history";

export const metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/admin/careers/applications/[id]">) {
  const { id } = await params;
  const a = await getApplication(id);
  if (!a) notFound();

  const years = experienceKey(a.yearsExperience);
  const facts = [
    { k: "Email", v: a.email },
    { k: "Phone", v: a.phone },
    { k: "Location", v: [a.city, a.country].filter(Boolean).join(", ") || null },
    { k: "Experience", v: years ? en.options.experience[years] : null },
    { k: "Languages", v: a.languages },
    { k: "Work mode", v: a.workMode ? en.options.workModes[a.workMode] : null },
    { k: "Available", v: a.availability },
    { k: "Expected pay", v: a.expectedSalary },
    { k: "Applied in", v: a.locale === "fr" ? "French" : "English" },
  ];
  const links = [
    { k: "LinkedIn", v: a.linkedin },
    { k: "Portfolio", v: a.portfolio },
    { k: "GitHub", v: a.github },
  ].filter((l) => l.v);

  return (
    <>
      <Link href="/admin/careers" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> All applications
      </Link>
      <PageHeader
        eyebrow={a.reference}
        title={a.fullName}
        description={
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <ApplicationBadge status={a.status} />
            {a.opening ? (
              <Link href={`/careers/${a.opening.slug}`} className="text-fog-50 underline-offset-4 hover:underline">
                {a.roleTitle}
              </Link>
            ) : (
              a.roleTitle
            )}
            <span>· {formatDateTime(a.createdAt)}</span>
          </span>
        }
        actions={
          <a href={`mailto:${a.email}?subject=${encodeURIComponent(`Your application to MovEra — ${a.reference}`)}`} className={buttonClasses({ variant: "secondary" })}>
            <Mail size={16} /> Open in mail app
          </a>
        }
      />

      <div className="grid gap-8 xl:grid-cols-3">
        <div className="space-y-8 xl:col-span-2">
          <Panel title="Motivation">
            <p className="whitespace-pre-line break-words p-5 text-sm leading-relaxed text-fog-50">{a.motivation}</p>
          </Panel>
          {a.skills.length > 0 && (
            <Panel title="Skills">
              <ul className="flex flex-wrap gap-2 p-5">
                {a.skills.map((s) => (
                  <li key={s} className="rounded-full border border-line px-3 py-1 text-sm text-fog-200">
                    {s}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <div className="grid gap-8 md:grid-cols-2">
            <Panel title="Details">
              <dl className="divide-y divide-line">
                {facts.map((f) => (
                  <div key={f.k} className="flex justify-between gap-4 px-5 py-3 text-sm">
                    <dt className="text-fog-500">{f.k}</dt>
                    <dd className="truncate text-right text-fog-50">{f.v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title="CV & links">
              <ul className="divide-y divide-line">
                {a.cvBlobId && (
                  <li>
                    <a href={`/api/cv/${a.id}`} target="_blank" rel="noopener" className="group flex items-center gap-3 px-5 py-3 text-sm hover:bg-fog-50/[0.03]">
                      <FileIcon size={16} className="text-flux" />
                      <span className="min-w-0 flex-1 truncate text-fog-50">{a.cvName}</span>
                      <span className="font-mono text-2xs text-fog-500">{a.cvSize ? formatBytes(a.cvSize) : ""}</span>
                      <Download size={16} className="text-fog-500 group-hover:text-flux" />
                    </a>
                  </li>
                )}
                {links.map((l) => (
                  <li key={l.k}>
                    <a href={l.v!} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-center gap-3 px-5 py-3 text-sm hover:bg-fog-50/[0.03]">
                      <span className="w-20 shrink-0 text-fog-500">{l.k}</span>
                      <span className="min-w-0 flex-1 truncate text-ion-soft">{l.v}</span>
                      <ArrowUpRight size={14} className="text-fog-500 group-hover:text-flux" />
                    </a>
                  </li>
                ))}
                {!a.cvBlobId && !links.length && <li className="px-5 py-4 text-sm text-fog-500">No CV or links.</li>}
              </ul>
            </Panel>
          </div>
          <Panel title={`Emails (${a.emails.length})`}>
            <EmailHistory emails={a.emails} />
          </Panel>
        </div>

        <div className="space-y-8">
          <Panel title="Status & notes">
            <ApplicationStatusForm id={a.id} status={a.status} notes={a.adminNotes} />
          </Panel>
          <Panel title="Email the candidate">
            <EmailComposer to={a.email} name={a.fullName} applicationId={a.id} locale={a.locale} defaultSubject={a.locale === "fr" ? `Votre candidature chez MovEra — ${a.reference}` : `Your application to MovEra — ${a.roleTitle}`} />
          </Panel>
          <Panel title={<span className="text-danger">Delete application</span>} className="border-danger/20">
            <form action={deleteApplicationAction} className="space-y-3 p-5">
              <input type="hidden" name="id" value={a.id} />
              <p className="text-sm leading-relaxed text-fog-400">Permanently removes this application and its CV, for example when the candidate asks you to.</p>
              <ConfirmSubmit size="sm">Delete permanently</ConfirmSubmit>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
