import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getUserConversations } from "@/lib/data/client";
import { fmt } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRight, Chat } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.messages.title };
}

export default async function MessagesPage() {
  const user = await requireUser();
  const { locale, t } = await getI18n();
  const m = t.dashboard.messages;
  const conversations = await getUserConversations(user.id);

  return (
    <>
      <PageHeader eyebrow={m.eyebrow} title={m.title} description={m.lead} />
      <Panel>
        {conversations.length ? (
          <ul className="divide-y divide-line">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/requests/${c.reference}#chat`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-fog-50/[0.03]">
                  <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-fog-200">
                    <Chat size={18} />
                    {c.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-flux shadow-[var(--glow-flux)]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-fog-50">{c.title}</span>
                      <StatusBadge status={c.status} />
                      {c.unread > 0 && (
                        <span className="rounded-full bg-flux px-2 py-0.5 font-mono text-2xs text-ink-950">{fmt(m.unread, { count: c.unread })}</span>
                      )}
                    </span>
                    <span className={`mt-1 block truncate text-sm ${c.unread ? "text-fog-200" : "text-fog-500"}`}>
                      {c.last ? `${c.last.fromStaff ? `${t.chat.team}: ` : `${m.you}: `}${c.last.body}` : m.noMessages}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-2xs text-fog-500 sm:block">{c.last ? formatDateTime(c.last.createdAt, locale) : c.reference}</span>
                  <ArrowRight size={16} className="shrink-0 text-fog-500 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-flux" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Chat size={20} />}
            title={m.empty}
            action={
              <ButtonLink href="/dashboard/requests" size="sm" variant="secondary">
                {t.dashboard.projects.viewRequests}
              </ButtonLink>
            }
          >
            {m.emptyBody}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
