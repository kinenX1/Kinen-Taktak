"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { categoryInfo, formatPrice } from "@/config/shop";
import { siteConfig } from "@/config/site";
import type { ProductCardData } from "@/lib/data/products";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Figure } from "@/components/brand/figure";
import { TextRing } from "@/components/brand/motion-marks";
import { addToBag } from "@/components/cart/cart-store";
import { Button } from "@/components/ui/button";

type Props = { product: ProductCardData & { description: string } };

/** The campaign spotlight: pick a colour and the model changes outfit live. */
export function Spotlight({ product }: Props) {
  const [colorIndex, setColorIndex] = useState(0);
  const [size, setSize] = useState(product.sizes.includes("M") ? "M" : product.sizes[0]!);
  const color = product.colors[colorIndex] ?? product.colors[0]!;
  const garment = categoryInfo(product.category).garment;
  const pre = product.availability === "PRE_ORDER";
  const word = product.name.split(" ")[0]!.toLowerCase();

  const look = {
    skin: "#8A5A3C",
    top: garment === "pants" || garment === "shorts" ? "#ECE8DF" : color.hex,
    pants: garment === "pants" || garment === "shorts" || garment === "pyjama" ? color.hex : "#151514",
    long: garment === "hoodie" || garment === "jacket" || garment === "pyjama",
    hood: garment === "hoodie",
    joggers: garment === "hoodie" || garment === "pants",
    pyjama: garment === "pyjama",
    hair: garment !== "hoodie",
  };

  return (
    <section aria-labelledby="spot-title" className="overflow-hidden bg-ground-2">
      <div className="container-x flex flex-wrap items-center gap-10 py-[clamp(3.5rem,7vw,6.5rem)]">
        <div className="min-w-0 flex-[1_1_300px]">
          <p className="label mb-2 ml-1.5 text-xl">New collection</p>
          <h2 id="spot-title" className="text-[clamp(7rem,14vw,13.5rem)] font-black leading-[0.78] tracking-[-0.02em] [font-stretch:62.5%]">
            {word}.
          </h2>
          <p className="mt-8 max-w-md font-mono text-sm leading-[1.85] text-body">
            The <strong className="text-ink">{product.name}</strong> by NovaWear. {product.description}
          </p>
          <p className="mt-5 font-mono text-sm text-body">
            Show us yours: <strong className="text-ink">{siteConfig.hashtag}</strong>
          </p>
          <Link href={`/shop/${product.slug}`} className="label group mt-7 inline-flex min-h-11 items-center gap-3.5 text-lg">
            <span className="flex size-11 items-center justify-center rounded-full bg-ink transition-transform duration-500 group-hover:scale-110">
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4l13 8-13 8z" fill="var(--color-bone)" />
              </svg>
            </span>
            Details
          </Link>
        </div>

        <div className="relative mx-auto flex flex-none items-end justify-center pt-5">
          <TextRing text={`${product.name} • Drop 01 • NovaWear`} className="absolute left-1/2 top-[46%] w-[min(500px,86vw)] -translate-x-1/2 -translate-y-1/2" />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={color.hex}
              initial={{ opacity: 0, y: 30, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -20, rotate: 2 }}
              transition={{ duration: 0.6, ease: ease.outExpo }}
              className="relative"
            >
              <div className="animate-bob">
                <Figure look={look} label={`Model wearing the ${product.name} in ${color.name}`} style={{ height: "clamp(380px, 46vw, 640px)" }} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="max-w-sm flex-[1_1_280px]">
          <p className="label mb-3.5 text-[0.9375rem]">Choose your colour</p>
          <div className="flex flex-wrap gap-3.5" role="radiogroup" aria-label="Colour">
            {product.colors.map((c, i) => (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={i === colorIndex}
                onClick={() => setColorIndex(i)}
                className="flex flex-col items-start gap-2"
              >
                <span className="size-12 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)] transition-transform hover:scale-105" style={{ background: c.hex }} />
                <span className={cn("h-1 w-12 transition-colors", i === colorIndex ? "bg-ink" : "bg-transparent")} />
                <span className="label text-xs">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="my-6 h-px bg-line-strong" />
          <dl className="label grid gap-2.5 text-[0.9375rem]">
            <div className="flex gap-2">
              <dt>Price:</dt>
              <dd>{formatPrice(product.price)}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Shown:</dt>
              <dd>
                Size {size} / {color.name}
              </dd>
            </div>
            {pre && product.preorderNote && <dd className="text-muted">{product.preorderNote}</dd>}
          </dl>
          <div className="my-6 h-px bg-line-strong" />
          <p className="label mb-3 text-[0.9375rem]">Choose your size</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
            {product.sizes.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={s === size}
                onClick={() => setSize(s)}
                className={cn(
                  "h-11 min-w-12 border-[1.5px] px-2 text-base font-bold [font-stretch:80%] transition-colors",
                  s === size ? "border-ink bg-ink text-bone" : "border-line-strong bg-paper hover:border-ink",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={product.availability === "SOLD_OUT"}
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
          >
            {product.availability === "SOLD_OUT" ? "Sold out" : pre ? "Pre-order now" : "Add to your bag"}
          </Button>
        </div>
      </div>
    </section>
  );
}
