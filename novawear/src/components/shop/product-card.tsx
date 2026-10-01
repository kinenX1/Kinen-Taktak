import Link from "next/link";
import { formatPrice } from "@/config/shop";
import type { ProductCardData } from "@/lib/data/products";
import { AvailabilityBadge } from "@/components/ui/badge";
import { ProductMedia } from "./product-media";
import { QuickAdd } from "./quick-add";

export function ProductCard({ product, priority }: { product: ProductCardData; priority?: boolean }) {
  const color = product.colors[0] ?? { name: "Default", hex: "#DAD9D4" };
  return (
    <article className="group/card flex flex-col gap-3.5">
      <div className="group relative aspect-[4/5] overflow-hidden rounded-md bg-ground-2 transition-colors duration-500 hover:bg-[#d2d1cb]">
        <Link href={`/shop/${product.slug}`} aria-label={product.name} className="absolute inset-0 z-[1]">
          <ProductMedia
            name={product.name}
            category={product.category}
            colorHex={color.hex}
            images={product.images}
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          />
        </Link>
        <AvailabilityBadge availability={product.availability} className="pointer-events-none absolute left-3 top-3 z-[2]" />
        {product.availability !== "SOLD_OUT" && <QuickAdd product={product} />}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.0625rem] font-bold leading-snug">
            <Link href={`/shop/${product.slug}`} className="hover:text-leopard-ink">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 font-mono text-xs tracking-[0.06em] text-muted">{formatPrice(product.price)}</p>
        </div>
        <ul className="flex shrink-0 gap-1.5 pt-1" aria-label={`${product.colors.length} colour${product.colors.length === 1 ? "" : "s"}`}>
          {product.colors.slice(0, 5).map((c) => (
            <li key={c.name} title={c.name} className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ background: c.hex }}>
              <span className="sr-only">{c.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
