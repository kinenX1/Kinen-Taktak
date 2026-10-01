import Image from "next/image";
import Link from "next/link";
import { toggleProductFlagAction } from "@/actions/admin";
import { categoryInfo, formatPrice } from "@/config/shop";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminProducts } from "@/lib/data/admin";
import { AdminHeader } from "@/components/admin/admin-shell";
import { Garment } from "@/components/brand/garment";
import { imageUrl } from "@/components/shop/product-media";
import { AvailabilityBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Star } from "@/components/ui/icons";

export const metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const [products, sp] = await Promise.all([getAdminProducts(), searchParams]);

  return (
    <>
      <AdminHeader
        eyebrow={`${products.length} product${products.length === 1 ? "" : "s"}`}
        title="Products"
        actions={
          <ButtonLink href="/admin/products/new" arrow>
            Add a product
          </ButtonLink>
        }
      >
        T-shirts, pants, hoodies, pyjamas and more. Featured products appear on the home page.
      </AdminHeader>
      {sp.deleted === "1" && (
        <div className="mb-6">
          <FormMessage tone="success">Product deleted.</FormMessage>
        </div>
      )}
      {products.length === 0 ? (
        <div className="bg-paper p-10 text-center">
          <p className="display text-4xl">No products yet</p>
          <ButtonLink href="/admin/products/new" className="mt-6" arrow>
            Add your first product
          </ButtonLink>
        </div>
      ) : (
        <div className="overflow-x-auto bg-paper">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-left font-mono text-2xs uppercase tracking-[0.1em] text-muted">
                <th scope="col" className="px-5 py-3 font-medium">Product</th>
                <th scope="col" className="px-3 py-3 font-medium">Category</th>
                <th scope="col" className="px-3 py-3 font-medium">Price</th>
                <th scope="col" className="px-3 py-3 font-medium">Colours</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-3 py-3 font-medium">In shop</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Featured</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cat = categoryInfo(p.category);
                return (
                  <tr key={p.id} className="border-t border-line hover:bg-bone">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-bold hover:text-leopard-ink">
                        <span className="relative h-14 w-11 shrink-0 overflow-hidden bg-ground-2">
                          {p.images[0] ? (
                            <Image src={imageUrl(p.images[0].id)} alt="" fill unoptimized sizes="44px" className="object-cover" />
                          ) : (
                            <span className="absolute inset-1">
                              <Garment kind={cat.garment} color={p.colors[0]?.hex ?? "#DAD9D4"} />
                            </span>
                          )}
                        </span>
                        <span>
                          {p.name}
                          <span className="block font-mono text-2xs font-normal text-muted">
                            {p._count.images} photo{p._count.images === 1 ? "" : "s"} · {p.sizes.join(" ")}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{cat.label}</td>
                    <td className="px-3 py-2.5 font-mono">{formatPrice(p.price)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex gap-1">
                        {p.colors.map((c) => (
                          <span key={c.name} title={c.name} className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ background: c.hex }} />
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <AvailabilityBadge availability={p.availability} />
                    </td>
                    <td className="px-3 py-2.5">
                      <form action={toggleProductFlagAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="flag" value="published" />
                        <button
                          type="submit"
                          role="switch"
                          aria-checked={p.published}
                          aria-label={`Show ${p.name} in the shop`}
                          className={`relative h-7 w-12 rounded-full transition-colors ${p.published ? "bg-ink" : "bg-stone/50"}`}
                        >
                          <span className={`absolute top-1 size-5 rounded-full bg-paper transition-[left] ${p.published ? "left-6" : "left-1"}`} />
                        </button>
                      </form>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <form action={toggleProductFlagAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="flag" value="featured" />
                        <button type="submit" aria-pressed={p.featured} aria-label={`Feature ${p.name} on the home page`} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-ink/5">
                          <Star size={19} fill={p.featured ? "var(--color-leopard)" : "none"} className={p.featured ? "text-leopard-ink" : "text-stone"} />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
