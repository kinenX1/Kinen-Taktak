"use client";

import type { ProductCardData } from "@/lib/data/products";
import { addToBag } from "@/components/cart/cart-store";

/** Size buttons that slide up over the card on hover; one tap adds to the bag. */
export function QuickAdd({ product }: { product: ProductCardData }) {
  const color = product.colors[0];
  if (!color || product.sizes.length === 0) return null;
  const pre = product.availability === "PRE_ORDER";
  return (
    <div className="absolute inset-x-2 bottom-2 z-[3] translate-y-[calc(100%+0.5rem)] bg-paper/95 p-2 backdrop-blur transition-transform duration-500 ease-(--ease-snap) group-hover/card:translate-y-0 group-focus-within/card:translate-y-0 max-md:hidden">
      <p className="eyebrow mb-1.5 px-1 text-2xs">
        {pre ? "Pre-order" : "Quick add"} · {color.name}
      </p>
      <div className="flex flex-wrap gap-1">
        {product.sizes.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() =>
              addToBag({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                category: product.category,
                price: product.price,
                colorName: color.name,
                colorHex: color.hex,
                size,
                quantity: 1,
                preorder: pre,
                imageId: product.images[0]?.id ?? null,
              })
            }
            aria-label={`Add ${product.name}, ${color.name}, size ${size} to bag`}
            className="label h-9 min-w-10 flex-1 border-[1.5px] border-ink/25 px-2 text-xs transition-colors hover:border-ink hover:bg-ink hover:text-bone"
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}
