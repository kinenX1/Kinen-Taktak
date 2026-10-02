import type { ApplicationStatus } from "@prisma/client";
import { en } from "@/i18n/dictionaries/en";
import { Badge } from "@/components/ui/badge";

const tone: Record<ApplicationStatus, "neutral" | "info" | "accent" | "success" | "danger"> = {
  NEW: "accent",
  REVIEWING: "info",
  INTERVIEW: "info",
  OFFER: "accent",
  HIRED: "success",
  REJECTED: "neutral",
};

export function ApplicationBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge tone={tone[status]} dot>
      {en.options.applicationStatuses[status]}
    </Badge>
  );
}
