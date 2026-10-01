import Image from "next/image";
import type { Category } from "@prisma/client";
import { categoryInfo } from "@/config/shop";
import { cn } from "@/lib/utils";
import { Garment } from "@/components/brand/garment";
import { imageUrl } from "@/components/shop/product-media";

/** Small product picture for bag lines and order summaries. */
export function LineThumb({ category, colorHex, imageId, className }: { category: Category; colorHex: string; imageId?: string | null; className?: string }) {
  return (
    <span className={cn("relative block aspect-[4/5] shrink-0 overflow-hidden rounded-sm bg-ground-2", className)}>
      {imageId ? (
        <Image src={imageUrl(imageId)} alt="" fill unoptimized sizes="140px" className="object-cover" />
      ) : (
        <span className="absolute inset-[10%]">
          <Garment kind={categoryInfo(category).garment} color={colorHex} />
        </span>
      )}
    </span>
  );
}
