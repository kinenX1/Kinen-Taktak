"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteProductImageAction, makeCoverImageAction, uploadProductImageAction } from "@/actions/admin";
import { imageRules } from "@/config/shop";
import { cn } from "@/lib/utils";
import { imageUrl } from "@/components/shop/product-media";
import { Spinner } from "@/components/ui/spinner";
import { Star, Trash, Upload } from "@/components/ui/icons";

type Img = { id: string; width: number; height: number; position: number };

/** Shrinks a photo in the browser so uploads stay fast and small. */
async function resize(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, imageRules.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (blob && blob.type === "image/webp") return { blob, width, height };
  // Older browsers without WebP encoding fall back to JPEG.
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!jpeg) throw new Error("This photo could not be read.");
  return { blob: jpeg, width, height };
}

export function ImageManager({ productId, productName, images }: { productId: string; productName: string; images: Img[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();
  const left = imageRules.maxPerProduct - images.length;

  async function upload(files: File[]) {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, left));
    if (!list.length) {
      setErrors([left <= 0 ? `This product already has ${imageRules.maxPerProduct} photos.` : "Choose JPG, PNG or WebP photos."]);
      return;
    }
    setErrors([]);
    const problems: string[] = [];
    for (const [i, file] of list.entries()) {
      setBusy(`Uploading ${i + 1} of ${list.length}…`);
      try {
        const { blob, width, height } = await resize(file);
        const data = new FormData();
        data.set("productId", productId);
        data.set("file", new File([blob], "photo", { type: blob.type }));
        data.set("width", String(width));
        data.set("height", String(height));
        const result = await uploadProductImageAction(data);
        if (!result.ok) problems.push(`${file.name}: ${result.error}`);
      } catch {
        problems.push(`${file.name}: this photo could not be read.`);
      }
    }
    setBusy(null);
    setErrors(problems);
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  }

  return (
    <section aria-labelledby="photos-title" className="bg-paper p-[clamp(1.25rem,2.5vw,2rem)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="photos-title" className="display text-3xl">
            Photos
          </h2>
          <p className="text-sm text-muted">
            {images.length} of {imageRules.maxPerProduct}. The first photo is the cover; the second shows on hover.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id} className="group relative aspect-[4/5] overflow-hidden bg-ground-2">
            <Image src={imageUrl(img.id)} alt={`${productName} photo ${i + 1}`} fill unoptimized sizes="200px" className="object-cover" />
            {i === 0 && <span className="absolute left-2 top-2 bg-ink px-2 py-1 font-mono text-2xs font-bold uppercase tracking-[0.1em] text-bone">Cover</span>}
            <div className="absolute inset-x-2 bottom-2 flex gap-1.5">
              {i > 0 && (
                <form action={makeCoverImageAction} className="flex-1">
                  <input type="hidden" name="imageId" value={img.id} />
                  <button type="submit" className="label flex h-9 w-full items-center justify-center gap-1.5 bg-paper/95 text-2xs hover:bg-bone">
                    <Star size={14} /> Cover
                  </button>
                </form>
              )}
              <form action={deleteProductImageAction}>
                <input type="hidden" name="imageId" value={img.id} />
                <button type="submit" aria-label={`Delete photo ${i + 1}`} className="flex size-9 items-center justify-center bg-paper/95 text-danger hover:bg-danger hover:text-bone">
                  <Trash size={16} />
                </button>
              </form>
            </div>
          </li>
        ))}
        {left > 0 && (
          <li className={cn("col-span-2 sm:col-span-1", images.length === 0 && "sm:col-span-4")}>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void upload(Array.from(e.dataTransfer.files));
              }}
              className={cn(
                "flex h-full min-h-44 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-4 text-center transition-colors",
                dragging ? "border-ink bg-bone" : "border-line-strong hover:border-ink",
                busy && "pointer-events-none opacity-70",
              )}
            >
              {busy ? <Spinner className="size-6" /> : <Upload size={26} />}
              <span className="font-bold">{busy ?? "Add photos"}</span>
              <span className="text-xs text-muted">Drop or browse — JPG, PNG or WebP. Resized automatically.</span>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={!!busy} onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
            </label>
          </li>
        )}
      </ul>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-sm text-danger">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
