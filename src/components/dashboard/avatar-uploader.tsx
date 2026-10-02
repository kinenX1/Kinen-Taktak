"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { removeAvatarAction, uploadAvatarAction } from "@/actions/account";
import { useT } from "@/i18n/client";
import { ease } from "@/lib/motion";
import { initialFormState, type FormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { UserAvatar } from "@/components/ui/avatar";
import { Camera, Trash } from "@/components/ui/icons";

const OUTPUT = 512;
const VIEW = 240;

/**
 * Profile photo picker. The image is cropped to a square in the browser —
 * drag to position, slide to zoom — then resized before upload, so even large
 * phone photos upload quickly.
 */
export function AvatarUploader({ name, src }: { name: string; src: string | null }) {
  const dict = useT();
  const t = dict.dashboard.profile;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  // Image drawn to fill the square at zoom 1 ("cover").
  const base = image ? VIEW / Math.min(image.naturalWidth, image.naturalHeight) : 1;
  const w = image ? image.naturalWidth * base * zoom : 0;
  const h = image ? image.naturalHeight * base * zoom : 0;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - w, o.x)),
    y: Math.min(0, Math.max(VIEW - h, o.y)),
  });

  useEffect(() => {
    if (!image) return;
    // Re-centre whenever zoom changes so the crop stays valid.
    setOffset((o) => clamp(o)); // eslint-disable-line react-hooks/set-state-in-effect -- keep the crop inside the image
  }, [zoom, image]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (file: File | undefined) => {
    setState(initialFormState);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setState({ message: t.photoInvalid });
    if (file.size > 8 * 1024 * 1024) return setState({ message: t.photoTooLarge });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = VIEW / Math.min(img.naturalWidth, img.naturalHeight);
      setImage(img);
      setZoom(1);
      setOffset({ x: (VIEW - img.naturalWidth * s) / 2, y: (VIEW - img.naturalHeight * s) / 2 });
    };
    img.onerror = () => setState({ message: t.photoInvalid });
    img.src = url;
  };

  const save = () => {
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d")!;
    const k = OUTPUT / VIEW;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, offset.x * k, offset.y * k, w * k, h * k);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setState({ message: t.photoFailed });
        const fd = new FormData();
        fd.append("avatar", blob, blob.type === "image/webp" ? "avatar.webp" : blob.type === "image/png" ? "avatar.png" : "avatar.jpg");
        start(async () => {
          const result = await uploadAvatarAction(initialFormState, fd);
          setState(result);
          if (result.ok) {
            setImage(null);
            router.refresh();
          }
        });
      },
      "image/webp",
      0.88,
    );
  };

  const remove = () =>
    start(async () => {
      const result = await removeAvatarAction();
      setState(result);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-center gap-6 p-6 text-center">
      <AnimatePresence mode="wait" initial={false}>
        {image ? (
          <motion.div key="crop" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.4, ease: ease.outExpo }} className="w-full">
            <div
              className="relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-ink-800"
              style={{ width: VIEW, height: VIEW, cursor: grabbing ? "grabbing" : "grab" }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
                setGrabbing(true);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
              }}
              onPointerUp={() => {
                drag.current = null;
                setGrabbing(false);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setGrabbing(false);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={image.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: offset.x, top: offset.y, width: w, height: h }} />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-flux/80 shadow-[0_0_0_9999px_rgb(6_7_9/0.62),0_0_30px_rgb(255_90_31/0.35)]" />
            </div>
            <label className="mx-auto mt-5 flex max-w-[15rem] items-center gap-3 text-xs text-fog-400">
              {t.zoom}
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--color-flux)]" />
            </label>
            <div className="mt-5 flex justify-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)} disabled={pending}>
                {dict.common.cancel}
              </Button>
              <Button type="button" size="sm" onClick={save} pending={pending}>
                {pending ? t.uploading : t.upload}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: ease.outExpo }} className="flex flex-col items-center gap-6">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="group relative rounded-full"
              aria-label={src ? t.change : t.upload}
            >
              <UserAvatar name={name} src={src} size={152} ring />
              <span className="absolute inset-[4px] flex items-center justify-center rounded-full bg-ink-950/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <Camera size={28} />
              </span>
            </button>
            <p className="max-w-[16rem] text-xs leading-relaxed text-fog-500">{t.photoLead}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
                <Camera size={15} /> {src ? t.change : t.upload}
              </Button>
              {src && (
                <Button type="button" size="sm" variant="ghost" onClick={remove} pending={pending}>
                  <Trash size={15} /> {t.removePhoto}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}
    </div>
  );
}
