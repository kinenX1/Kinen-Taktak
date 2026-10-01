"use client";

import Link from "next/link";
import { useState } from "react";
import type { Availability, Category } from "@prisma/client";
import { cartRules } from "@/config/shop";
import { cn } from "@/lib/utils";
import { addToBag } from "@/components/cart/cart-store";
import { Magnetic } from "@/components/motion/magnetic";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "@/components/ui/icons";

/** Lets the gallery follow the colour picked here. */
export const SELECT_COLOR_EVENT = "novawear:select-color";

type Props = {
  product: {
    id: string;
    slug: string;
    name: string;
    category: Category;
    price: number;
    availability: Availability;
    sizes: string[];
    colors: { name: string; hex: string }[];
    imageId: string | null;
  };
};

export function ProductPurchase({ product }: Props) {
  const [colorIndex, setColorIndex] = useState(0);
  const [size, setSize] = useState<string | null>(product.sizes.length === 1 ? product.sizes[0]! : null);
  const [qty, setQty] = useState(1);
  const [showSizeError, setShowSizeError] = useState(false);
  const color = product.colors[colorIndex];
  const soldOut = product.availability === "SOLD_OUT";
  const pre = product.availability === "PRE_ORDER";

  const pickColor = (i: number) => {
    setColorIndex(i);
    window.dispatchEvent(new CustomEvent(SELECT_COLOR_EVENT, { detail: product.colors[i]!.hex }));
  };

  const add = () => {
    if (!size) {
      setShowSizeError(true);
      return;
    }
    if (!color) return;
    addToBag({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      category: product.category,
      price: product.price,
      colorName: color.name,
      colorHex: color.hex,
      size,
      quantity: qty,
      preorder: pre,
      imageId: product.imageId,
    });
  };

  return (
    <div className="mt-6 border-t border-line-strong pt-6">
      <fieldset>
        <legend className="label mb-3 text-[0.9375rem]">Colour — {color?.name}</legend>
        <div className="flex flex-wrap gap-3">
          {product.colors.map((c, i) => (
            <label key={c.name} className="cursor-pointer">
              <input type="radio" name="colour" className="peer sr-only" checked={i === colorIndex} onChange={() => pickColor(i)} />
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border-2 p-[3px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                  i === colorIndex ? "border-ink" : "border-transparent hover:border-ink/30",
                )}
              >
                <span className="size-full rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]" style={{ background: c.hex }} />
              </span>
              <span className="sr-only">{c.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6" aria-describedby={showSizeError && !size ? "size-error" : undefined}>
        <legend className="label mb-3 text-[0.9375rem]">Size{size ? ` — ${size}` : ""}</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
          {product.sizes.map((s) => (
            <label key={s} className="cursor-pointer">
              <input
                type="radio"
                name="size"
                className="peer sr-only"
                checked={s === size}
                onChange={() => {
                  setSize(s);
                  setShowSizeError(false);
                }}
              />
              <span
                className={cn(
                  "flex h-12 items-center justify-center border-[1.5px] text-base font-bold [font-stretch:80%] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                  s === size ? "border-ink bg-ink text-bone" : "border-line-strong bg-paper hover:border-ink",
                )}
              >
                {s}
              </span>
            </label>
          ))}
        </div>
        {showSizeError && !size && (
          <p id="size-error" role="alert" className="mt-2 text-sm font-semibold text-danger">
            Pick your size first.
          </p>
        )}
      </fieldset>

      <div className="mt-6 flex gap-2.5">
        <div className="flex h-14 items-center border-[1.5px] border-line-strong">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="flex h-full w-11 items-center justify-center hover:bg-ink/5">
            <Minus size={16} />
          </button>
          <span aria-live="polite" aria-label={`Quantity ${qty}`} className="min-w-7 text-center font-mono font-bold">
            {qty}
          </span>
          <button type="button" onClick={() => setQty((q) => Math.min(cartRules.maxQuantity, q + 1))} aria-label="Increase quantity" className="flex h-full w-11 items-center justify-center hover:bg-ink/5">
            <Plus size={16} />
          </button>
        </div>
        <Magnetic className="flex-1" strength={0.12}>
          <Button size="lg" className="h-14 w-full" onClick={add} disabled={soldOut}>
            {soldOut ? "Sold out" : pre ? "Pre-order now" : "Add to bag"}
          </Button>
        </Magnetic>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-body">
        {pre ? "Pre-ordering locks your size and colour. We confirm by message and ship when the drop lands." : "In stock. Pay on delivery."}{" "}
        <Link href="/bag" className="font-semibold underline underline-offset-4">
          View bag
        </Link>
      </p>
    </div>
  );
}
