import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { getChatRequest, getThread, markThreadRead } from "@/lib/data/chat";

/**
 * Returns a chat thread and marks the other side's messages as read.
 * `?as=staff` is only honoured for administrators.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/chat/[requestId]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId } = await ctx.params;
  const side = req.nextUrl.searchParams.get("as") === "staff" ? "staff" : "client";

  const request = await getChatRequest(user, requestId, side);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await markThreadRead(requestId, side);
  const messages = await getThread(requestId);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
}
