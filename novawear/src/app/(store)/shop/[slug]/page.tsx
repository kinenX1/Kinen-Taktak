import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryInfo, formatPrice } from "@/config/shop";
import { getProductBySlug, getRelatedProducts } from "@/lib/data/products";
import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductPurchase } from "@/components/shop/product-purchase";
import { AvailabilityBadge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/shop/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: product.images[0] ? { images: [{ url: `/api/images/${product.images[0].id}` }] } : undefined,
  };
}

export default async function ProductPage({ params }: PageProps<"/shop/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const related = await getRelatedProducts(product.category, product.id);
  const category = categoryInfo(product.category);
  const details = product.details.split("\n").map((d) => d.trim()).filter(Boolean);

  return (
    <div className="container-x pb-24 pt-6">
      <nav aria-label="Breadcrumb" className="eyebrow mb-6 flex flex-wrap gap-2.5">
        <Link href="/shop" className="hover:text-ink">
          Shop
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/shop?category=${category.slug}`} className="hover:text-ink">
          {category.label}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink" aria-current="page">
          {product.name}
        </span>
      </nav>

      <div className="flex flex-wrap items-start gap-[clamp(1.5rem,4vw,3.5rem)]">
        <ProductGallery
          name={product.name}
          category={product.category}
          colors={product.colors}
          images={product.images}
          preorder={product.availability === "PRE_ORDER"}
        />

        <div className="max-w-[520px] flex-[1_1_380px] lg:sticky lg:top-24">
          <AvailabilityBadge availability={product.availability} />
          {product.availability === "PRE_ORDER" && product.preorderNote && (
            <p className="eyebrow mt-3 flex items-center gap-2.5 text-body">
              <span className="size-2 animate-blink rounded-full bg-ink" />
              {product.preorderNote}
            </p>
          )}
          <h1 className="display mt-3 text-[clamp(4rem,7vw,6.5rem)]">{product.name}</h1>
          <p className="mt-4 text-[1.625rem] font-extrabold [font-stretch:80%]">{formatPrice(product.price)}</p>
          <p className="mt-4 text-base leading-relaxed text-body">{product.description}</p>

          <ProductPurchase
            product={{
              id: product.id,
              slug: product.slug,
              name: product.name,
              category: product.category,
              price: product.price,
              availability: product.availability,
              sizes: product.sizes,
              colors: product.colors,
              imageId: product.images[0]?.id ?? null,
            }}
          />

          <div className="mt-8 border-t-[1.5px] border-ink">
            {details.length > 0 && (
              <details className="group border-b border-line-strong" open>
                <summary className="label flex min-h-14 cursor-pointer list-none items-center justify-between text-[0.9375rem] [&::-webkit-details-marker]:hidden">
                  Details
                  <span aria-hidden="true" className="font-mono text-xl transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <ul className="mb-5 list-disc space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed text-body">
                  {details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
            <details className="group border-b border-line-strong">
              <summary className="label flex min-h-14 cursor-pointer list-none items-center justify-between text-[0.9375rem] [&::-webkit-details-marker]:hidden">
                Delivery &amp; pre-orders
                <span aria-hidden="true" className="font-mono text-xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mb-5 space-y-2 text-[0.9375rem] leading-relaxed text-body">
                <p>Pay on delivery. After you order we call or message you to confirm your address and delivery.</p>
                <p>Pre-orders lock your size and colour. They ship as soon as the drop lands, and you can follow every step from your account.</p>
              </div>
            </details>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="ctl" className="mt-[clamp(4rem,8vw,7rem)]">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 id="ctl" className="display text-[clamp(3.25rem,7vw,6.25rem)]">
              Complete the look
            </h2>
            <Link href="/shop" className="label inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              See the full drop
            </Link>
          </div>
          <ul className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p, i) => (
              <Reveal as="li" key={p.id} delay={i * 0.06}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
