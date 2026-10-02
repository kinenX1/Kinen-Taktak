"use client";

import type { RequestStatus } from "@prisma/client";
import { requestStatuses } from "@/config/project-brief";
import { useT } from "@/i18n/client";
import { Badge } from "./badge";

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const t = useT();
  const s = requestStatuses.find((x) => x.value === status)!;
  return (
    <Badge tone={s.tone} dot className={className}>
      {t.options.statuses[status].label}
    </Badge>
  );
}
