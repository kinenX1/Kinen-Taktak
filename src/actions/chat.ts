"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { getChatRequest, toChatMessage, type ChatMessage, type ChatSide } from "@/lib/data/chat";
import { sendChatMessageEmail } from "@/lib/emails";
import { rateLimit } from "@/lib/rate-limit";
import { getI18n } from "@/i18n/server";

const schema = z.object({
  requestId: z.string().min(1).max(40),
  side: z.enum(["client", "staff"]),
  body: z.string().trim().min(1).max(4000),
});

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

/** Posts a chat message as the request's client or as MovEra staff. */
export async function sendMessageAction(input: { requestId: string; side: ChatSide; body: string }): Promise<SendResult> {
  const { t } = await getI18n();
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: t.chat.failed };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: input.body?.length > 4000 ? t.chat.tooLong : t.chat.failed };
  }
  const limited = await rateLimit("chat", 30, 60 * 1000);
  if (!limited.ok) return { ok: false, error: t.chat.tooFast };

  const { requestId, side, body } = parsed.data;
  const request = await getChatRequest(user, requestId, side);
  if (!request) return { ok: false, error: t.chat.failed };

  const fromStaff = side === "staff";
  // Only email the other side when this is the first message they haven't read yet.
  const alreadyWaiting = await db.projectMessage.count({ where: { requestId, fromStaff, readAt: null } });

  const created = await db.projectMessage.create({
    data: { requestId, authorId: user.id, fromStaff, body },
    include: { author: { select: { id: true, name: true, avatarAt: true } } },
  });
  await db.projectRequest.update({ where: { id: requestId }, data: { updatedAt: new Date() } });

  if (!alreadyWaiting) {
    await sendChatMessageEmail({
      toClient: fromStaff,
      reference: request.reference,
      title: request.title,
      authorName: user.name,
      body,
      client: request.user,
    });
  }

  revalidatePath(fromStaff ? "/dashboard" : "/admin", "layout");
  return { ok: true, message: toChatMessage(created) };
}
