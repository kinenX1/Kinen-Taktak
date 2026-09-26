import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { isInlineSafe, readStoredFile } from "@/lib/uploads";

/**
 * Serves a project attachment to its owner or to an administrator.
 * Files are never publicly addressable.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const file = await db.projectFile.findUnique({
    where: { id },
    include: { request: { select: { userId: true } } },
  });

  // Same 404 for "missing" and "not yours" so ids can't be probed.
  if (!file || (file.request.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readStoredFile(file.storedName);
  } catch {
    return NextResponse.json({ error: "File is no longer available" }, { status: 410 });
  }

  const disposition = isInlineSafe(file.mimeType) ? "inline" : "attachment";
  const encoded = encodeURIComponent(file.originalName);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
