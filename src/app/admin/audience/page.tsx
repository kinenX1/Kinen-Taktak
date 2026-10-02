import Link from "next/link";
import { deleteSubscriberAction } from "@/actions/email";
import { getAudience, getEmailLog, type AudienceEntry } from "@/lib/data/admin";
import { emailConfigured } from "@/lib/email";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Mail, Trash, Users } from "@/components/ui/icons";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/dashboard/page-header";
import { EmailHistory } from "@/components/admin/email-history";
import { CopyEmails } from "@/components/admin/copy-emails";

export const metadata = { title: "Audience & email" };

const sourceLabel: Record<AudienceEntry["sources"][number], { label: string; tone: "accent" | "info" | "success" | "neutral" }> = {
  client: { label: "Client", tone: "accent" },
  contact: { label: "Contact form", tone: "info" },
  applicant: { label: "Applicant", tone: "success" },
  subscriber: { label: "Subscriber", tone: "neutral" },
};

const filters = [
  { key: "", label: "Everyone" },
  { key: "client", label: "Clients" },
  { key: "contact", label: "Contact form" },
  { key: "applicant", label: "Applicants" },
  { key: "subscriber", label: "Subscribers" },
] as const;

export default async function AudiencePage({ searchParams }: PageProps<"/admin/audience">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : undefined;
  const source = filters.find((f) => f.key && f.key === sp.source)?.key;
  const [everyone, log] = await Promise.all([getAudience(q), getEmailLog()]);
  const people = source ? everyone.filter((p) => p.sources.includes(source)) : everyone;
  const configured = emailConfigured();

  const href = (key: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (key) params.set("source", key);
    const s = params.toString();
    return s ? `/admin/audience?${s}` : "/admin/audience";
  };

  return (
    <>
      {!configured && (
        <Notice tone="warning">
          Email sending isn&apos;t set up yet, so emails are only saved in the log. Add the SMTP settings (Gmail works) in your hosting environment
          variables to deliver them for real.
        </Notice>
      )}
      <PageHeader
        eyebrow="Admin"
        title="Audience & email"
        description="Everyone who has given MovEra their email — clients, contact-form senders, job applicants and subscribers. Write to anyone directly from here."
        actions={<CopyEmails emails={people.map((p) => p.email)} label={`Copy ${people.length} emails`} />}
      />

      <form className="mb-4 flex gap-3" role="search">
        {source && <input type="hidden" name="source" value={source} />}
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search name or email" />
        <button type="submit" className="h-12 shrink-0 rounded-md border border-line-strong px-5 text-sm hover:border-fog-50/60">
          Search
        </button>
      </form>
      <nav aria-label="Filter audience" className="no-scrollbar mb-6 flex gap-1 overflow-x-auto">
        {filters.map((f) => {
          const count = f.key ? everyone.filter((p) => p.sources.includes(f.key as AudienceEntry["sources"][number])).length : everyone.length;
          const active = (source ?? "") === f.key;
          return (
            <Link
              key={f.key || "all"}
              href={href(f.key)}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors", active ? "bg-fog-50 text-ink-950" : "text-fog-400 hover:text-fog-50")}
            >
              {f.label}
              <span className={cn("font-mono text-2xs", active ? "text-ink-950/60" : "text-fog-500")}>{count}</span>
            </Link>
          );
        })}
      </nav>

      <Panel>
        {people.length ? (
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.email} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fog-50">{p.name ?? p.email}</span>
                  <span className="block truncate text-sm text-fog-500">
                    {p.name ? `${p.email} · ` : ""}
                    {formatDate(p.lastSeen)}
                    {p.locale === "fr" ? " · FR" : ""}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {p.sources.map((s) => (
                    <Badge key={s} tone={sourceLabel[s].tone}>
                      {sourceLabel[s].label}
                    </Badge>
                  ))}
                </span>
                <span className="flex items-center gap-2">
                  {p.userId && (
                    <Link href={`/admin/clients/${p.userId}`} className="text-xs text-fog-400 hover:text-fog-50">
                      Profile
                    </Link>
                  )}
                  <Link
                    href={`/admin/audience/compose?${new URLSearchParams({ to: p.email, ...(p.name ? { name: p.name } : {}), ...(p.locale ? { locale: p.locale } : {}) })}`}
                    className={buttonClasses({ size: "sm" })}
                  >
                    <Mail size={14} /> Email
                  </Link>
                  {p.subscriberId && p.sources.length === 1 && (
                    <form action={deleteSubscriberAction}>
                      <input type="hidden" name="id" value={p.subscriberId} />
                      <button type="submit" aria-label={`Remove ${p.email} from the list`} className="flex size-9 items-center justify-center rounded-full text-fog-500 hover:bg-danger/10 hover:text-danger">
                        <Trash size={15} />
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Users size={20} />} title={q ? "Nobody matches that search" : "No one yet"}>
            When people create an account, use the contact form, apply for a job or subscribe in the footer, they appear here.
          </EmptyState>
        )}
      </Panel>

      <Panel title="Recently sent emails" className="mt-8">
        <EmailHistory emails={log} showRecipient />
      </Panel>
    </>
  );
}
