import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Serves a profile photo. Photos are addressed by an unguessable user id and
 * a version query, so responses can be cached indefinitely.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[userId]">) {
  const { userId } = await ctx.params;
  const avatar = await db.avatar.findUnique({ where: { userId } });
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.mimeType,
      "Content-Length": String(avatar.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
