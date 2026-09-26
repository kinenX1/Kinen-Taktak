import type { ProjectUpdate } from "@prisma/client";
import { labelFor } from "@/config/project-brief";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Update = ProjectUpdate & { author: { name: string } | null };

export function UpdateFeed({ updates, showVisibility }: { updates: Update[]; showVisibility?: boolean }) {
  if (!updates.length) return <p className="px-5 py-4 text-sm text-fog-500">No updates yet.</p>;
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
                  ? `${labelFor.status(u.fromStatus)} → ${labelFor.status(u.toStatus)}`
                  : `Request ${labelFor.status(u.toStatus).toLowerCase()}`
                : "Message"}
            </p>
            {showVisibility && u.visibility === "INTERNAL" && <Badge tone="info">Internal</Badge>}
          </div>
          {u.body && <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-fog-200">{u.body}</p>}
          <p className="mt-2 font-mono text-2xs text-fog-500">
            {formatDateTime(u.createdAt)}
            {u.author ? ` · ${u.author.name}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
