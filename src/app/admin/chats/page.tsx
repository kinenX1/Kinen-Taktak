import Link from "next/link";
import { getStaffConversations } from "@/lib/data/chat";
import { avatarUrl } from "@/lib/avatar";
import { formatDateTime } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRight, Chat } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";

export const metadata = { title: "Chats" };

export default async function ChatsPage() {
  const conversations = await getStaffConversations();
  return (
    <>
      <PageHeader eyebrow="Admin" title="Chats" description="Conversations with clients about their project requests. Unread client messages are highlighted." />
      <Panel>
        {conversations.length ? (
          <ul className="divide-y divide-line">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/requests/${c.reference}#chat`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-fog-50/[0.03]">
                  <span className="relative">
                    <UserAvatar name={c.user.name} src={avatarUrl(c.user)} size={44} />
                    {c.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-ink-950 bg-flux" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fog-50">{c.user.name}</span>
                      <span className="truncate text-sm text-fog-400">· {c.title}</span>
                      <StatusBadge status={c.status} />
                      {c.unread > 0 && <span className="rounded-full bg-flux px-2 py-0.5 font-mono text-2xs text-ink-950">{c.unread} new</span>}
                    </span>
                    <span className={`mt-1 block truncate text-sm ${c.unread ? "text-fog-200" : "text-fog-500"}`}>
                      {c.last.fromStaff ? "You: " : ""}
                      {c.last.body}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-2xs text-fog-500 sm:block">{formatDateTime(c.last.createdAt)}</span>
                  <ArrowRight size={16} className="shrink-0 text-fog-500 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-flux" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Chat size={20} />} title="No conversations yet">
            When a client writes in the chat on one of their requests, the conversation appears here. You can also start one from any request page.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
