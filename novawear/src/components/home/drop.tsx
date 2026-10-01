import Link from "next/link";
import { categories } from "@/config/shop";
import type { ProductCardData } from "@/lib/data/products";
import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/shop/product-card";
import { ButtonLink } from "@/components/ui/button";

export function Drop({ products }: { products: ProductCardData[] }) {
  return (
    <section id="drop" aria-labelledby="drop-title" className="container-x pb-[clamp(4rem,8vw,7.5rem)]">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow mb-3">Drop 01 — {products.length} pieces</p>
          <h2 id="drop-title" className="display text-[clamp(4.5rem,11vw,11rem)] leading-[0.8]">
            The drop
          </h2>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Shop by category">
          <li>
            <Link href="/shop" className="label inline-flex h-11 items-center rounded-full border-2 border-ink bg-ink px-4 text-xs text-bone">
              All
            </Link>
          </li>
          {categories.slice(0, 4).map((c) => (
            <li key={c.value}>
              <Link
                href={`/shop?category=${c.slug}`}
                className="label inline-flex h-11 items-center rounded-full border-2 border-ink px-4 text-xs transition-colors hover:bg-ink hover:text-bone"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {products.length === 0 ? (
        <p className="border-t-2 border-ink py-10 text-lg">The first drop is loading. Check back soon.</p>
      ) : (
        <ul className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p, i) => (
            <Reveal as="li" key={p.id} delay={(i % 4) * 0.07}>
              <ProductCard product={p} priority={i < 4} />
            </Reveal>
          ))}
        </ul>
      )}
      <div className="mt-12 flex justify-center">
        <ButtonLink href="/shop" variant="outline" size="lg" arrow>
          Shop everything
        </ButtonLink>
      </div>
    </section>
  );
}
