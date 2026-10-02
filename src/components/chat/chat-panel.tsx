import type { ChatMessage, ChatSide } from "@/lib/data/chat";
import { Panel } from "@/components/dashboard/page-header";
import { ChatThread } from "./chat-thread";

/** Titled panel around a chat thread, anchored at #chat for email links. */
export function ChatPanel({
  title,
  lead,
  live,
  ...thread
}: {
  title: string;
  lead?: string;
  live: string;
  requestId: string;
  side: ChatSide;
  initial: ChatMessage[];
  me: { name: string; avatar: string | null };
  other?: { name: string; avatar: string | null };
}) {
  return (
    <section id="chat" className="scroll-mt-24">
      <Panel
        title={
          <span className="flex items-center gap-2.5">
            {title}
            <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] text-success">
              <span className="size-1.5 animate-pulse rounded-full bg-success" /> {live}
            </span>
          </span>
        }
        className="overflow-hidden"
      >
        {lead && <p className="border-b border-line px-5 py-3 text-xs leading-relaxed text-fog-400">{lead}</p>}
        <ChatThread {...thread} />
      </Panel>
    </section>
  );
}
