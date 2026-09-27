import Link from "next/link";
import type { ProjectType, RequestStatus } from "@prisma/client";
import { labelFor, projectTypes, requestStatuses } from "@/config/project-brief";
import { searchRequests } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Folder, Search } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";

export const metadata = { title: "Requests" };

export default async function AdminRequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = requestStatuses.find((s) => s.value === sp.status)?.value as RequestStatus | undefined;
  const type = projectTypes.find((t) => t.value === sp.type)?.value as ProjectType | undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, pages } = await searchRequests({ q: q || undefined, status, type, page });

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    params.set("page", String(p));
    return `/admin/requests?${params}`;
  };

  return (
    <>
      <PageHeader eyebrow="Admin" title="Project requests" description={`${total} ${total === 1 ? "request" : "requests"} found.`} />

      <form role="search" className="mb-6 grid gap-3 md:grid-cols-12" action="/admin/requests">
        <label htmlFor="q" className="sr-only">
          Search requests
        </label>
        <div className="relative md:col-span-6">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fog-500" />
          <Input id="q" name="q" defaultValue={q} placeholder="Search by reference, title, client or email" className="pl-11" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {requestStatuses
              .filter((s) => s.value !== "DRAFT")
              .map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
          </Select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="type" className="sr-only">
            Project type
          </label>
          <Select id="type" name="type" defaultValue={type ?? ""}>
            <option value="">All types</option>
            {projectTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClasses({ variant: "secondary", className: "h-12 md:col-span-2" })}>
          Filter
        </button>
      </form>

      <Panel>
        {items.length ? (
          <>
            {/* Phones: stacked rows so status stays visible without sideways scrolling. */}
            <ul className="divide-y divide-line md:hidden">
              {items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/requests/${r.reference}`}
                    className="flex flex-col gap-2 px-5 py-4 transition-colors active:bg-fog-50/[0.03]"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-fog-50">{r.title}</span>
                        <span className="font-mono text-2xs text-fog-500">{r.reference}</span>
                      </span>
                      <span className="shrink-0 text-xs text-fog-500">{formatDate(r.createdAt)}</span>
                    </span>
                    <span className="text-sm text-fog-400">
                      {r.contactName}
                      {r.contactCompany ? ` · ${r.contactCompany}` : ""}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fog-500">
                      <StatusBadge status={r.status} />
                      {labelFor.projectType(r.projectType)} · {labelFor.budget(r.budget)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="font-mono text-2xs uppercase tracking-[0.1em] text-fog-500">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-5 py-3 font-normal">Request</th>
                    <th scope="col" className="px-5 py-3 font-normal">Client</th>
                    <th scope="col" className="px-5 py-3 font-normal">Type</th>
                    <th scope="col" className="px-5 py-3 font-normal">Budget</th>
                    <th scope="col" className="px-5 py-3 font-normal">Status</th>
                    <th scope="col" className="px-5 py-3 font-normal">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-fog-50/[0.03]">
                      <td className="px-5 py-4">
                        <Link href={`/admin/requests/${r.reference}`} className="font-medium text-fog-50 hover:underline">
                          {r.title}
                        </Link>
                        <p className="font-mono text-2xs text-fog-500">{r.reference}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-fog-200">{r.contactName}</p>
                        <p className="text-xs text-fog-500">{r.contactCompany ?? r.contactEmail}</p>
                      </td>
                      <td className="px-5 py-4 text-fog-400">{labelFor.projectType(r.projectType)}</td>
                      <td className="px-5 py-4 text-fog-400">{labelFor.budget(r.budget)}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-5 py-4 text-fog-500">{formatDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState icon={<Folder size={20} />} title="No requests match">
            Try a different search or clear the filters.
          </EmptyState>
        )}
      </Panel>

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          <span className="text-fog-500">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={pageHref(page + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
