import "server-only";
import { imageRules } from "@/config/shop";

const startsWith = (b: Buffer, bytes: number[], offset = 0) => bytes.every((v, i) => b[offset + i] === v);

// Allow-list verified by file signature, never by the client-provided type.
const KINDS = [
  { mime: "image/png", check: (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { mime: "image/jpeg", check: (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    mime: "image/webp",
    check: (b: Buffer) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
] as const;

export type ValidatedImage = { buffer: Buffer; mimeType: string };

export async function validateImage(file: unknown): Promise<ValidatedImage | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };
  if (file.size > imageRules.maxBytes) {
    return { error: `Photos must be ${imageRules.maxBytes / 1024 / 1024} MB or smaller.` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = KINDS.find((k) => k.check(buffer));
  if (!kind) return { error: "Use a JPG, PNG or WebP photo." };
  return { buffer, mimeType: kind.mime };
}

/** Clamp client-reported dimensions; they only drive layout aspect ratios. */
export function safeDimension(value: unknown) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : 1000;
}
