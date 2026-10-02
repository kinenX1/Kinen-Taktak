import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { readStoredFile } from "@/lib/uploads";

/** Serves an applicant's CV to administrators only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/cv/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await ctx.params;
  const application = await db.jobApplication.findUnique({ where: { id }, select: { cvBlobId: true, cvName: true, cvMime: true } });
  if (!application?.cvBlobId || !application.cvMime) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readStoredFile(application.cvBlobId);
  } catch {
    return NextResponse.json({ error: "File is no longer available" }, { status: 410 });
  }
  const inline = application.cvMime === "application/pdf";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": application.cvMime,
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(application.cvName ?? "cv")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
