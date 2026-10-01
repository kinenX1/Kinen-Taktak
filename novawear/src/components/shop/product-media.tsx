import Image from "next/image";
import type { Category } from "@prisma/client";
import { categoryInfo } from "@/config/shop";
import { cn } from "@/lib/utils";
import { Garment } from "@/components/brand/garment";

export type MediaImage = { id: string; width: number; height: number; alt: string };

export const imageUrl = (id: string) => `/api/images/${id}`;

/**
 * Shows the product photo when there is one, otherwise a flat-lay
 * illustration in the product's first colour. On hover the second photo
 * (or the back of the garment) slides in.
 */
export function ProductMedia({
  name,
  category,
  colorHex,
  images,
  sizes,
  priority,
  hoverSwap = true,
  className,
}: {
  name: string;
  category: Category;
  colorHex: string;
  images: MediaImage[];
  sizes: string;
  priority?: boolean;
  hoverSwap?: boolean;
  className?: string;
}) {
  const [first, second] = images;
  const kind = categoryInfo(category).garment;
  const hasBack = kind === "tee" || kind === "hoodie";
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {first ? (
        <Image
          src={imageUrl(first.id)}
          alt={first.alt || name}
          fill
          unoptimized
          priority={priority}
          sizes={sizes}
          className="object-cover transition-transform duration-700 ease-(--ease-snap) group-hover:scale-[1.05]"
        />
      ) : (
        <div className="absolute inset-[12%_10%_8%] transition-transform duration-700 ease-(--ease-snap) group-hover:-rotate-3 group-hover:scale-[1.06]">
          <Garment kind={kind} color={colorHex} />
          <span className="sr-only">{name}</span>
        </div>
      )}
      {hoverSwap && (second || (!first && hasBack)) && (
        <div className="absolute inset-0 translate-y-full bg-ground-2 transition-transform duration-700 ease-(--ease-snap) group-hover:translate-y-0">
          {second ? (
            <Image src={imageUrl(second.id)} alt="" fill unoptimized sizes={sizes} className="object-cover" />
          ) : (
            <div className="absolute inset-[12%_10%_8%]">
              <Garment kind={kind} color={colorHex} back />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
