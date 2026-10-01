import { db } from "@/lib/db";

/**
 * Serves product photos stored in the database. Photos are immutable (a new
 * upload gets a new id), so they can be cached forever by browsers and CDNs.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/images/[id]">) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response("Not found", { status: 404 });

  const image = await db.productImage.findUnique({
    where: { id },
    select: { data: true, mimeType: true, product: { select: { published: true } } },
  });
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.data.byteLength),
      "Cache-Control": image.product.published ? "public, max-age=31536000, immutable" : "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
