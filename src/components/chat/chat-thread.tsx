"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { sendMessageAction } from "@/actions/chat";
import type { ChatMessage, ChatSide } from "@/lib/data/chat";
import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/avatar";
import { Chat, Send } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

type Pending = ChatMessage & { pending?: boolean; failed?: boolean };

const POLL_MS = 5000;

/**
 * Live conversation between a client and the MovEra team. New messages
 * appear instantly for the sender and are polled for the other side every
 * few seconds while the tab is visible.
 */
export function ChatThread({
  requestId,
  side,
  initial,
  me,
  other,
}: {
  requestId: string;
  side: ChatSide;
  initial: ChatMessage[];
  me: { name: string; avatar: string | null };
  /** The client, when the viewer is staff. */
  other?: { name: string; avatar: string | null };
}) {
  const { t, locale } = useI18n();
  const c = t.chat;
  const [messages, setMessages] = useState<Pending[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const nextId = useRef(0);
  // Reference time for "Today" / "Yesterday" labels.
  const [now] = useState(() => Date.now());
  const mine = (m: ChatMessage) => m.fromStaff === (side === "staff");

  // Poll for new messages while visible.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/chat/${requestId}${side === "staff" ? "?as=staff" : ""}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMessages((prev) => {
          const known = new Set(data.messages.map((m) => m.id));
          // Keep local messages the server hasn't returned yet (in flight, failed, or just confirmed).
          const local = prev.filter((m) => !known.has(m.id) && (m.pending || m.failed || Date.now() - +new Date(m.createdAt) < 15_000));
          return [...data.messages, ...local];
        });
      } catch {
        // Offline — try again on the next tick.
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [requestId, side]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = (body: string, retryId?: string) => {
    const text = body.trim();
    if (!text) return;
    if (text.length > 4000) return setError(c.tooLong);
    setError(null);
    const tempId = retryId ?? `temp-${++nextId.current}`;
    const optimistic: Pending = {
      id: tempId,
      body: text,
      fromStaff: side === "staff",
      createdAt: new Date().toISOString(),
      readAt: null,
      author: me,
      pending: true,
    };
    stick.current = true;
    setMessages((prev) => [...prev.filter((m) => m.id !== tempId), optimistic]);
    if (!retryId) setDraft("");
    start(async () => {
      const result = await sendMessageAction({ requestId, side, body: text });
      setMessages((prev) =>
        result.ok
          ? prev.map((m) => (m.id === tempId ? result.message : m))
          : prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      if (!result.ok) setError(result.error);
    });
    inputRef.current?.focus();
  };

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date(now);
    const yesterday = new Date(now - 864e5);
    if (d.toDateString() === today.toDateString()) return c.today;
    if (d.toDateString() === yesterday.toDateString()) return c.yesterday;
    return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" }).format(d);
  };
  const time = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const lastMine = [...messages].reverse().find((m) => mine(m) && !m.pending && !m.failed);

  return (
    <div className="flex h-[34rem] flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="relative flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="relative flex size-14 items-center justify-center rounded-full border border-line text-flux">
              <Chat size={24} />
              <span className="absolute inset-0 animate-ping rounded-full border border-flux/30" />
            </span>
            <p className="max-w-xs text-sm leading-relaxed text-fog-400">{side === "client" ? c.emptyClient : c.empty}</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const grouped = !newDay && prev && prev.fromStaff === m.fromStaff && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60e3;
            const isMine = mine(m);
            const who = m.fromStaff ? (m.author?.name ?? c.team) : (m.author?.name ?? other?.name ?? "");
            return (
              <motion.div key={m.id} layout="position" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: ease.outExpo }}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3" role="separator">
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-2xs uppercase tracking-[0.12em] text-fog-500">{dayLabel(m.createdAt)}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div className={cn("flex items-end gap-2.5", isMine && "flex-row-reverse", grouped ? "mt-1" : "mt-3")}>
                  <span className={cn("w-8 shrink-0", grouped && "invisible")}>
                    <UserAvatar name={who || "?"} src={isMine ? me.avatar : m.author?.avatar ?? (m.fromStaff ? null : other?.avatar)} size={32} />
                  </span>
                  <div className={cn("flex max-w-[78%] flex-col", isMine ? "items-end" : "items-start")}>
                    {!grouped && (
                      <p className={cn("mb-1 flex items-center gap-2 px-1 text-2xs text-fog-500", isMine && "flex-row-reverse")}>
                        <span className="font-medium text-fog-200">{isMine ? c.you : who}</span>
                        {m.fromStaff && !isMine && (
                          <span className="rounded-full border border-flux/30 bg-flux/10 px-1.5 py-px font-mono uppercase tracking-[0.08em] text-flux-soft">{c.team}</span>
                        )}
                        <span>{time(m.createdAt)}</span>
                      </p>
                    )}
                    <div
                      className={cn(
                        "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed",
                        isMine
                          ? "rounded-br-md bg-gradient-to-br from-flux to-flux-deep text-ink-950 shadow-[0_10px_30px_-12px_rgb(255_90_31/0.6)]"
                          : "rounded-bl-md border border-line bg-ink-800 text-fog-50",
                        m.pending && "opacity-70",
                        m.failed && "border border-danger/50 bg-danger/10 text-fog-50",
                      )}
                    >
                      {m.body}
                    </div>
                    {m.failed ? (
                      <button type="button" onClick={() => send(m.body, m.id)} className="mt-1 px-1 text-2xs text-danger underline-offset-2 hover:underline">
                        {c.failed} ↻
                      </button>
                    ) : m.pending ? (
                      <span className="mt-1 flex items-center gap-1.5 px-1 text-2xs text-fog-500">
                        <Spinner className="size-3" /> {c.sending}
                      </span>
                    ) : (
                      m.id === lastMine?.id && <span className="mt-1 px-1 text-2xs text-fog-500">{m.readAt ? `${c.seen} ✓✓` : `${c.delivered} ✓`}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-line p-3 sm:p-4"
      >
        {error && (
          <p role="alert" className="mb-2 px-1 text-xs text-danger">
            {error}
          </p>
        )}
        <div className="beam-border flex items-end gap-2 rounded-2xl bg-ink-900 p-2 pl-4">
          <label htmlFor={`chat-${requestId}`} className="sr-only">
            {c.placeholder}
          </label>
          <textarea
            id={`chat-${requestId}`}
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder={c.placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.9375rem] leading-relaxed text-fog-50 placeholder:text-fog-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={c.send}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-flux text-ink-950 transition-[transform,background-color,opacity] duration-300 hover:bg-flux-soft active:scale-90 disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </div>
        <p className="mt-2 hidden px-1 text-2xs text-fog-500 sm:block">{c.hint}</p>
      </form>
    </div>
  );
}
