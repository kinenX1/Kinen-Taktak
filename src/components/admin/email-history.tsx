import type { EmailStatus } from "@prisma/client";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Row = { id: string; to: string; subject: string; body: string; status: EmailStatus; createdAt: Date; sentBy: { name: string } | null };

const tone = { SENT: "success", FAILED: "danger", LOGGED: "neutral" } as const;
const label = { SENT: "Sent", FAILED: "Failed", LOGGED: "Not delivered" } as const;

/** Emails the team has written, newest first. */
export function EmailHistory({ emails, showRecipient }: { emails: Row[]; showRecipient?: boolean }) {
  if (!emails.length) return <p className="px-5 py-4 text-sm text-fog-500">No emails sent yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {emails.map((e) => (
        <li key={e.id} className="px-5 py-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fog-50">{e.subject}</span>
                <span className="mt-0.5 block truncate text-xs text-fog-500">
                  {showRecipient ? `${e.to} · ` : ""}
                  {formatDateTime(e.createdAt)}
                  {e.sentBy ? ` · ${e.sentBy.name}` : ""}
                </span>
              </span>
              <Badge tone={tone[e.status]}>{label[e.status]}</Badge>
            </summary>
            <p className="mt-3 whitespace-pre-line break-words rounded-md bg-ink-900 p-4 text-sm leading-relaxed text-fog-200">{e.body}</p>
          </details>
        </li>
      ))}
    </ol>
  );
}
