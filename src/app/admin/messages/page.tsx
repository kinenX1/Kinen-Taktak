import { setMessageStatusAction } from "@/actions/admin";
import { getMessages } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EmailComposer } from "@/components/admin/email-composer";

export const metadata = { title: "Messages" };

const tabs = [
  { label: "Inbox", value: undefined },
  { label: "New", value: "NEW" },
  { label: "Read", value: "READ" },
  { label: "Archived", value: "ARCHIVED" },
] as const;

export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const sp = await searchParams;
  const status = tabs.find((t) => t.value === sp.status)?.value;
  const messages = await getMessages(status);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Messages" description="Enquiries from the contact form. Reply by email right here — the sender gets it in their inbox." />
      <nav aria-label="Message filters" className="mb-6 flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.value ? `/admin/messages?status=${t.value}` : "/admin/messages"}
            aria-current={status === t.value ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full px-4 text-sm transition-colors",
              status === t.value ? "bg-fog-50 text-ink-950" : "text-fog-400 hover:text-fog-50",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Panel>
        {messages.length ? (
          <ul className="divide-y divide-line">
            {messages.map((m) => (
              <li key={m.id} className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.subject}
                      {m.status === "NEW" && <Badge tone="accent">New</Badge>}
                      {m._count.emails > 0 && <Badge tone="success">Replied</Badge>}
                    </p>
                    <p className="mt-1 text-sm text-fog-400">
                      {m.name}
                      {m.company ? ` · ${m.company}` : ""} ·{" "}
                      <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="text-ion-soft hover:underline">
                        {m.email}
                      </a>
                    </p>
                  </div>
                  <p className="font-mono text-2xs text-fog-500">{formatDateTime(m.createdAt)}</p>
                </div>
                <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-fog-200">{m.message}</p>
                <details className="group mt-4 rounded-md border border-line bg-ink-900/60 px-4 open:pb-1">
                  <summary className="flex h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-fog-50">
                    <span className="text-flux transition-transform group-open:rotate-45">+</span> Reply by email
                  </summary>
                  <EmailComposer to={m.email} name={m.name} contactMessageId={m.id} defaultSubject={`Re: ${m.subject}`} compact />
                </details>
                <div className="mt-4 flex gap-2">
                  {m.status !== "READ" && (
                    <form action={setMessageStatusAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value="READ" />
                      <Button type="submit" size="sm" variant="secondary">
                        Mark as read
                      </Button>
                    </form>
                  )}
                  {m.status !== "ARCHIVED" && (
                    <form action={setMessageStatusAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value="ARCHIVED" />
                      <Button type="submit" size="sm" variant="ghost">
                        Archive
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Inbox size={20} />} title="No messages here" />
        )}
      </Panel>
    </>
  );
}
