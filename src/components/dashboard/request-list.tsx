"use client";

import Link from "next/link";
import type { ProjectType, RequestStatus } from "@prisma/client";
import { useI18n } from "@/i18n/client";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRight } from "@/components/ui/icons";

type Row = {
  reference: string;
  title: string;
  projectType: ProjectType;
  status: RequestStatus;
  budget: string | null;
  updatedAt: Date;
  createdAt: Date;
};

/** Responsive list of requests: table rhythm on desktop, stacked rows on mobile. */
export function RequestList({ items, hrefBase = "/dashboard/requests" }: { items: Row[]; hrefBase?: string }) {
  const { t, locale } = useI18n();
  const l = t.dashboard.list;
  return (
    <ul className="divide-y divide-line">
      <li aria-hidden="true" className="hidden grid-cols-12 gap-4 px-5 py-3 font-mono text-2xs uppercase tracking-[0.1em] text-fog-500 md:grid">
        <span className="col-span-4">{l.project}</span>
        <span className="col-span-2">{l.type}</span>
        <span className="col-span-3">{l.status}</span>
        <span className="col-span-2">{l.updated}</span>
        <span className="col-span-1" />
      </li>
      {items.map((r) => (
        <li key={r.reference}>
          <Link
            href={`${hrefBase}/${r.reference}`}
            className="group grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-fog-50/[0.03] md:grid-cols-12 md:items-center md:gap-4"
          >
            <span className="min-w-0 md:col-span-4">
              <span className="block truncate font-medium text-fog-50">{r.title}</span>
              <span className="font-mono text-2xs text-fog-500">{r.reference}</span>
            </span>
            <span className="text-sm text-fog-400 md:col-span-2">{t.options.projectTypes[r.projectType].label}</span>
            <span className="md:col-span-3">
              <StatusBadge status={r.status} />
            </span>
            <span className="whitespace-nowrap text-sm text-fog-500 md:col-span-2">{formatDate(r.updatedAt, {}, locale)}</span>
            <span className="hidden justify-end md:col-span-1 md:flex">
              <ArrowRight size={16} className="text-fog-500 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-flux" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
