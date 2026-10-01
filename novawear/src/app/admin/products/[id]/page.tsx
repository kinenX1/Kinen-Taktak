import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProductAction } from "@/actions/admin";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminProduct } from "@/lib/data/admin";
import { AdminHeader } from "@/components/admin/admin-shell";
import { ImageManager } from "@/components/admin/image-manager";
import { ProductForm } from "@/components/admin/product-form";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { FormMessage } from "@/components/ui/field";
import { ArrowLeft } from "@/components/ui/icons";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) notFound();
  const created = (await searchParams).created === "1";

  return (
    <>
      <Link href="/admin/products" className="label mb-4 inline-flex min-h-11 items-center gap-2 text-xs hover:text-leopard-ink">
        <ArrowLeft size={16} /> Products
      </Link>
      <AdminHeader
        eyebrow="Edit product"
        title={product.name}
        actions={
          product.published ? (
            <ButtonLink href={`/shop/${product.slug}`} variant="outline" target="_blank">
              View in shop
            </ButtonLink>
          ) : undefined
        }
      />
      {created && (
        <div className="mb-6">
          <FormMessage tone="success">Product created. Now add photos so customers can see it — or keep the illustration for now.</FormMessage>
        </div>
      )}
      <div className="space-y-8">
        <ImageManager productId={product.id} productName={product.name} images={product.images} />
        <ProductForm
          product={{
            id: product.id,
            name: product.name,
            description: product.description,
            details: product.details,
            category: product.category,
            price: (product.price / 100).toFixed(2),
            availability: product.availability,
            preorderNote: product.preorderNote ?? "",
            sizes: product.sizes,
            colors: product.colors,
            published: product.published,
            featured: product.featured,
            sortOrder: product.sortOrder,
          }}
        />
        <section aria-labelledby="danger-title" className="border-2 border-danger/40 p-5">
          <h2 id="danger-title" className="label text-[0.9375rem] text-danger">
            Delete product
          </h2>
          <p className="mt-1 text-sm text-body">Removes it from the shop. Past orders keep their details.</p>
          <form action={deleteProductAction} className="mt-4">
            <input type="hidden" name="id" value={product.id} />
            <ConfirmSubmit size="sm">Delete {product.name}</ConfirmSubmit>
          </form>
        </section>
      </div>
    </>
  );
}
