import Link from "next/link";
import { requestStatuses } from "@/config/project-brief";
import { getAdminOverview } from "@/lib/data/admin";
import { labelFor } from "@/config/project-brief";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { Folder } from "@/components/ui/icons";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const { counts, totalClients, newMessages, recent } = await getAdminOverview();
  const pipeline = requestStatuses.filter((s) => s.value !== "DRAFT");
  const total = pipeline.reduce((n, s) => n + (counts[s.value] ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Studio overview"
        actions={
          <ButtonLink href="/admin/requests?status=SUBMITTED" arrow>
            Review new requests
          </ButtonLink>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {[
          { k: "New requests", v: counts.SUBMITTED ?? 0, href: "/admin/requests?status=SUBMITTED" },
          { k: "In progress", v: counts.IN_PROGRESS ?? 0, href: "/admin/requests?status=IN_PROGRESS" },
          { k: "Clients", v: totalClients, href: "/admin/clients" },
          { k: "Unread messages", v: newMessages, href: "/admin/messages" },
        ].map((s) => (
          <Link key={s.k} href={s.href} className="group bg-ink-900 p-5 transition-colors hover:bg-ink-850 md:p-6">
            <dt className="text-sm text-fog-400 group-hover:text-fog-200">{s.k}</dt>
            <dd className="mt-3 text-4xl font-medium tracking-[-0.04em]">{s.v}</dd>
          </Link>
        ))}
      </dl>

      <Panel title="Pipeline" className="mt-8">
        <div className="p-5 md:p-6">
          <div className="flex h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
            {pipeline.map((s, i) => {
              const n = counts[s.value] ?? 0;
              if (!n) return null;
              return (
                <div
                  key={s.value}
                  style={{ width: `${(n / Math.max(total, 1)) * 100}%`, opacity: 0.35 + (i / pipeline.length) * 0.65 }}
                  className={s.value === "CANCELLED" ? "bg-fog-500" : "bg-flux"}
                />
              );
            })}
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {pipeline.map((s) => (
              <li key={s.value}>
                <Link href={`/admin/requests?status=${s.value}`} className="block rounded-md p-2 transition-colors hover:bg-fog-50/[0.04]">
                  <p className="text-2xl font-medium">{counts[s.value] ?? 0}</p>
                  <p className="text-xs text-fog-400">{s.label}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel
        title="Latest requests"
        className="mt-8"
        action={
          <Link href="/admin/requests" className="text-xs text-fog-400 hover:text-fog-50">
            View all
          </Link>
        }
      >
        {recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.reference}>
                <Link href={`/admin/requests/${r.reference}`} className="grid gap-2 px-5 py-4 transition-colors hover:bg-fog-50/[0.03] md:grid-cols-12 md:items-center md:gap-4">
                  <span className="min-w-0 md:col-span-5">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="text-xs text-fog-500">
                      {r.contactName} · <span className="font-mono">{r.reference}</span>
                    </span>
                  </span>
                  <span className="text-sm text-fog-400 md:col-span-3">{labelFor.projectType(r.projectType)}</span>
                  <span className="md:col-span-2">
                    <StatusBadge status={r.status} />
                  </span>
                  <span className="text-sm text-fog-500 md:col-span-2 md:text-right">{formatDate(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Folder size={20} />} title="No requests yet">
            New project briefs will appear here as soon as clients submit them.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
