import Link from "next/link";
import type { ApplicationStatus } from "@prisma/client";
import { getOpeningsForAdmin, searchApplications } from "@/lib/data/admin";
import { en } from "@/i18n/dictionaries/en";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { FileIcon, Rocket } from "@/components/ui/icons";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/dashboard/page-header";
import { ApplicationBadge } from "@/components/admin/application-badge";

export const metadata = { title: "Careers" };

const statuses = Object.keys(en.options.applicationStatuses) as ApplicationStatus[];

export default async function AdminCareersPage({ searchParams }: PageProps<"/admin/careers">) {
  const sp = await searchParams;
  const tab = sp.tab === "openings" ? "openings" : "applications";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : undefined;
  const status = statuses.find((s) => s === sp.status);
  const opening = typeof sp.opening === "string" ? sp.opening : undefined;
  const [openings, applications] = await Promise.all([getOpeningsForAdmin(), tab === "applications" ? searchApplications({ q, status, opening }) : []]);

  return (
    <>
      {sp.saved && <Notice tone="success">Opening saved. The careers page has been updated.</Notice>}
      {sp.deleted && <Notice tone="success">Deleted.</Notice>}
      <PageHeader
        eyebrow="Admin"
        title="Careers"
        description="Applications from the careers page, and the job openings shown on /careers."
        actions={
          <ButtonLink href="/admin/careers/openings/new" arrow>
            New opening
          </ButtonLink>
        }
      />
      <nav aria-label="Careers sections" className="mb-6 flex gap-1">
        {[
          { key: "applications", label: "Applications", href: "/admin/careers" },
          { key: "openings", label: `Openings (${openings.length})`, href: "/admin/careers?tab=openings" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("flex h-9 items-center rounded-full px-4 text-sm transition-colors", tab === t.key ? "bg-fog-50 text-ink-950" : "text-fog-400 hover:text-fog-50")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "applications" ? (
        <>
          <form className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
            <label className="sr-only" htmlFor="q">
              Search applications
            </label>
            <Input id="q" name="q" defaultValue={q} placeholder="Search name, email, role or reference" />
            <Select name="status" defaultValue={status ?? ""} aria-label="Status">
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {en.options.applicationStatuses[s]}
                </option>
              ))}
            </Select>
            <Select name="opening" defaultValue={opening ?? ""} aria-label="Role">
              <option value="">All roles</option>
              {openings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
              <option value="spontaneous">Spontaneous</option>
            </Select>
            <button type="submit" className="h-12 rounded-md border border-line-strong px-5 text-sm hover:border-fog-50/60">
              Filter
            </button>
          </form>
          <Panel>
            {applications.length ? (
              <ul className="divide-y divide-line">
                {applications.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/careers/applications/${a.id}`} className="grid gap-2 px-5 py-4 transition-colors hover:bg-fog-50/[0.03] md:grid-cols-12 md:items-center md:gap-4">
                      <span className="min-w-0 md:col-span-4">
                        <span className="block truncate font-medium text-fog-50">{a.fullName}</span>
                        <span className="block truncate text-xs text-fog-500">{a.email}</span>
                      </span>
                      <span className="truncate text-sm text-fog-200 md:col-span-4">{a.roleTitle}</span>
                      <span className="md:col-span-2">
                        <ApplicationBadge status={a.status} />
                      </span>
                      <span className="flex items-center gap-3 text-sm text-fog-500 md:col-span-2 md:justify-end">
                        {a.cvName && <FileIcon size={14} aria-label="CV attached" />}
                        {formatDate(a.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Rocket size={20} />} title={q || status || opening ? "No matching applications" : "No applications yet"}>
                Applications sent from /careers appear here, with their CV and links.
              </EmptyState>
            )}
          </Panel>
        </>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {openings.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/careers/openings/${o.id}`} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-fog-50/[0.03]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.title}</span>
                    <span className="text-sm text-fog-500">
                      {o.team} · {en.options.employmentTypes[o.employmentType]} · {en.options.workModes[o.workMode]} · /careers/{o.slug}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Badge>{o._count.applications} applications</Badge>
                    <Badge tone={o.published ? "success" : "neutral"}>{o.published ? "Published" : "Hidden"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!openings.length && <EmptyState icon={<Rocket size={20} />} title="No openings yet" />}
        </Panel>
      )}
    </>
  );
}
