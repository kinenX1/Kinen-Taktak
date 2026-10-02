"use client";

import type { ProjectUpdate, RequestStatus } from "@prisma/client";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Update = ProjectUpdate & { author: { name: string } | null };

export function UpdateFeed({ updates, showVisibility }: { updates: Update[]; showVisibility?: boolean }) {
  const { t, locale } = useI18n();
  const f = t.dashboard.feed;
  const label = (s: RequestStatus | null) => (s ? t.options.statuses[s].label : "—");
  if (!updates.length) return <p className="px-5 py-4 text-sm text-fog-500">{f.empty}</p>;
  return (
    <ol className="space-y-6 p-5">
      {updates.map((u) => (
        <li key={u.id} className="relative border-l border-line pl-5">
          <span
            aria-hidden="true"
            className={`absolute -left-[4px] top-1 size-[7px] rounded-full ${u.visibility === "INTERNAL" ? "bg-ion" : "bg-flux"}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-fog-50">
              {u.kind === "STATUS_CHANGE"
                ? u.fromStatus
                  ? `${label(u.fromStatus)} → ${label(u.toStatus)}`
                  : fmt(f.requestStatus, { status: label(u.toStatus).toLowerCase() })
                : f.message}
            </p>
            {showVisibility && u.visibility === "INTERNAL" && <Badge tone="info">{f.internal}</Badge>}
          </div>
          {u.body && <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-fog-200">{u.body}</p>}
          <p className="mt-2 font-mono text-2xs text-fog-500">
            {formatDateTime(u.createdAt, locale)}
            {u.author ? ` · ${u.author.name}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
