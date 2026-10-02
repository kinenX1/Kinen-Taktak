import "server-only";
import { db } from "@/lib/db";
import { avatarUrl } from "@/lib/avatar";
import type { CurrentUser } from "@/lib/auth/dal";

export type ChatMessage = {
  id: string;
  body: string;
  fromStaff: boolean;
  createdAt: string;
  readAt: string | null;
  author: { name: string; avatar: string | null } | null;
};

export type ChatSide = "client" | "staff";

/**
 * Loads a request the user may chat on: its owner as "client", any admin as
 * "staff". Returns null otherwise, so callers answer 404 either way.
 */
export async function getChatRequest(user: CurrentUser, requestId: string, side: ChatSide) {
  if (side === "staff" && user.role !== "ADMIN") return null;
  const request = await db.projectRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      userId: true,
      user: { select: { id: true, name: true, email: true, locale: true } },
    },
  });
  if (!request || request.status === "DRAFT") return null;
  if (side === "client" && request.userId !== user.id) return null;
  return request;
}

export async function getThread(requestId: string): Promise<ChatMessage[]> {
  const rows = await db.projectMessage.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { author: { select: { id: true, name: true, avatarAt: true } } },
  });
  return rows.map(toChatMessage);
}

export function toChatMessage(m: {
  id: string;
  body: string;
  fromStaff: boolean;
  createdAt: Date;
  readAt: Date | null;
  author: { id: string; name: string; avatarAt: Date | null } | null;
}): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    fromStaff: m.fromStaff,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    author: m.author ? { name: m.author.name, avatar: avatarUrl(m.author) } : null,
  };
}

/** Marks the other side's messages as read by `side`. */
export async function markThreadRead(requestId: string, side: ChatSide) {
  await db.projectMessage.updateMany({
    where: { requestId, fromStaff: side === "client", readAt: null },
    data: { readAt: new Date() },
  });
}

/** Conversations for the admin inbox, most recent first. */
export async function getStaffConversations() {
  const requests = await db.projectRequest.findMany({
    where: { status: { not: "DRAFT" }, messages: { some: {} } },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      user: { select: { id: true, name: true, email: true, avatarAt: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, fromStaff: true } },
      _count: { select: { messages: { where: { fromStaff: false, readAt: null } } } },
    },
  });
  return requests
    .map((r) => ({ ...r, last: r.messages[0]!, unread: r._count.messages }))
    .sort((a, b) => +b.last.createdAt - +a.last.createdAt);
}
