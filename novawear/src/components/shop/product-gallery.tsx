"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Category } from "@prisma/client";
import { categoryInfo } from "@/config/shop";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Figure } from "@/components/brand/figure";
import { Garment } from "@/components/brand/garment";
import { TextRing } from "@/components/brand/motion-marks";
import { imageUrl, type MediaImage } from "./product-media";
import { SELECT_COLOR_EVENT } from "./product-purchase";

type Props = {
  name: string;
  category: Category;
  colors: { name: string; hex: string }[];
  images: MediaImage[];
  preorder: boolean;
};

/**
 * Photos when the admin has uploaded some; otherwise an illustrated model
 * plus front and back flat-lays that follow the selected colour.
 */
export function ProductGallery({ name, category, colors, images, preorder }: Props) {
  const [active, setActive] = useState(0);
  const [colorHex, setColorHex] = useState(colors[0]?.hex ?? "#DAD9D4");

  useEffect(() => {
    const onSelect = (e: Event) => setColorHex((e as CustomEvent<string>).detail);
    window.addEventListener(SELECT_COLOR_EVENT, onSelect);
    return () => window.removeEventListener(SELECT_COLOR_EVENT, onSelect);
  }, []);

  if (images.length > 0) {
    const current = images[Math.min(active, images.length - 1)]!;
    return (
      <div className="min-w-0 flex-[1_1_560px]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-ground-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: ease.outExpo }}
              className="absolute inset-0"
            >
              <Image src={imageUrl(current.id)} alt={current.alt || name} fill unoptimized priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
            </motion.div>
          </AnimatePresence>
        </div>
        {images.length > 1 && (
          <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="Photos">
            {images.map((img, i) => (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === active ? "true" : undefined}
                  className={cn("relative block size-20 overflow-hidden rounded-sm border-2 bg-ground-2", i === active ? "border-ink" : "border-transparent opacity-70 hover:opacity-100")}
                >
                  <Image src={imageUrl(img.id)} alt="" fill unoptimized sizes="80px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const kind = categoryInfo(category).garment;
  const lower = kind === "pants" || kind === "shorts";
  const look = {
    skin: "#8A5A3C",
    top: lower ? "#ECE8DF" : colorHex,
    pants: lower || kind === "pyjama" ? colorHex : "#151514",
    long: kind === "hoodie" || kind === "jacket" || kind === "pyjama",
    hood: kind === "hoodie",
    joggers: kind === "hoodie" || kind === "pants",
    pyjama: kind === "pyjama",
    hair: kind !== "hoodie",
  };

  return (
    <div className="grid min-w-0 flex-[1_1_560px] grid-cols-2 gap-3">
      <div className="relative col-span-2 flex aspect-[5/4] items-end justify-center overflow-hidden rounded-md bg-ground-2">
        <TextRing text={`${name} • Drop 01 • NovaWear`} className="absolute left-1/2 top-1/2 w-[74%] -translate-x-1/2 -translate-y-1/2" />
        {preorder && <span className="absolute left-4 top-4 bg-ink px-3 py-1.5 font-mono text-2xs font-bold uppercase tracking-[0.12em] text-bone">Pre-order</span>}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={colorHex}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: ease.outExpo }}
            className="relative h-[90%] pb-[3%]"
          >
            <div className="h-full animate-bob">
              <Figure look={look} label={`Model wearing the ${name}`} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {[false, true].map((back) => (
        <div key={String(back)} className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-ground-2">
          <span className="eyebrow absolute left-3.5 top-3.5">{back ? "Back" : "Front"}</span>
          <div className="w-[78%] transition-transform duration-700 ease-(--ease-snap) group-hover:scale-[1.06]">
            <Garment kind={kind} color={colorHex} back={back} />
          </div>
        </div>
      ))}
    </div>
  );
}
