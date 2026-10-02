import "server-only";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { uploadRules } from "@/config/project-brief";
import { db } from "@/lib/db";

/**
 * Storage for uploaded files (brief attachments, CVs). New files are kept in
 * the database (FileBlob) so they survive deploys on read-only serverless
 * filesystems such as Vercel; files saved to disk by earlier versions are
 * still read from UPLOAD_DIR. Files are only served through authorised
 * route handlers, never from /public.
 */

const BLOB_PREFIX = "blob:";
const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./storage/uploads");

type Kind = { mime: string; exts: string[]; check: (b: Buffer) => boolean };

const startsWith = (b: Buffer, bytes: number[], offset = 0) =>
  bytes.every((v, i) => b[offset + i] === v);

const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isText = (b: Buffer) => {
  if (b.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
};

// Allow-list verified by file signature, never by the client-provided type.
const KINDS: Kind[] = [
  { mime: "image/png", exts: [".png"], check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { mime: "image/jpeg", exts: [".jpg", ".jpeg"], check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { mime: "image/gif", exts: [".gif"], check: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  {
    mime: "image/webp",
    exts: [".webp"],
    check: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  { mime: "application/pdf", exts: [".pdf"], check: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    exts: [".docx"],
    check: isZip,
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    exts: [".pptx"],
    check: isZip,
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    exts: [".xlsx"],
    check: isZip,
  },
  { mime: "application/msword", exts: [".doc"], check: isOle },
  { mime: "application/vnd.ms-powerpoint", exts: [".ppt"], check: isOle },
  { mime: "application/vnd.ms-excel", exts: [".xls"], check: isOle },
  { mime: "text/plain", exts: [".txt", ".md"], check: isText },
];

export const MAX_FILE_BYTES = uploadRules.maxFileSizeMb * 1024 * 1024;

export type ValidatedFile = { buffer: Buffer; originalName: string; mimeType: string; ext: string };

export function sanitizeFileName(name: string) {
  const base = path.basename(name).normalize("NFKC");
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/_{2,}/g, "_").trim();
  return (cleaned || "file").slice(0, 120);
}

export async function validateUpload(file: File): Promise<ValidatedFile | { error: string }> {
  const originalName = sanitizeFileName(file.name);
  if (file.size === 0) return { error: `${originalName} is empty.` };
  if (file.size > MAX_FILE_BYTES) {
    return { error: `${originalName} is larger than ${uploadRules.maxFileSizeMb} MB.` };
  }
  const ext = path.extname(originalName).toLowerCase();
  const kind = KINDS.find((k) => k.exts.includes(ext));
  if (!kind) return { error: `${originalName} is not an accepted file type.` };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!kind.check(buffer)) {
    return { error: `${originalName} does not look like a valid ${ext} file.` };
  }
  return { buffer, originalName, mimeType: kind.mime, ext };
}

/** Stores the bytes and returns the key to save as `storedName`. */
export async function storeFile(file: Pick<ValidatedFile, "buffer">) {
  const blob = await db.fileBlob.create({ data: { data: new Uint8Array(file.buffer) }, select: { id: true } });
  return `${BLOB_PREFIX}${blob.id}`;
}

function resolveStored(storedName: string) {
  // storedName comes from the DB, but guard against traversal regardless.
  const safe = path.basename(storedName);
  return path.join(UPLOAD_DIR, safe);
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  if (storedName.startsWith(BLOB_PREFIX)) {
    const blob = await db.fileBlob.findUnique({ where: { id: storedName.slice(BLOB_PREFIX.length) } });
    if (!blob) throw new Error("File not found");
    return Buffer.from(blob.data);
  }
  return readFile(/*turbopackIgnore: true*/ resolveStored(storedName));
}

export async function deleteStoredFile(storedName: string) {
  if (storedName.startsWith(BLOB_PREFIX)) {
    await db.fileBlob.deleteMany({ where: { id: storedName.slice(BLOB_PREFIX.length) } });
    return;
  }
  await unlink(/*turbopackIgnore: true*/ resolveStored(storedName)).catch(() => {});
}

/** Detects JPEG, PNG, WebP or GIF from the file signature. */
export function imageKind(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  const kind = KINDS.slice(0, 4).find((k) => k.check(b));
  return (kind?.mime as ReturnType<typeof imageKind>) ?? null;
}

const CV_KINDS = KINDS.filter((k) => [".pdf", ".doc", ".docx"].some((e) => k.exts.includes(e)));
export const MAX_CV_BYTES = 4 * 1024 * 1024;

/** Validates a CV upload: PDF, DOC or DOCX, verified by signature. */
export async function validateCv(file: File): Promise<ValidatedFile | { error: "type" | "size" }> {
  if (file.size === 0 || file.size > MAX_CV_BYTES) return { error: "size" };
  const originalName = sanitizeFileName(file.name);
  const ext = path.extname(originalName).toLowerCase();
  const kind = CV_KINDS.find((k) => k.exts.includes(ext));
  if (!kind) return { error: "type" };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!kind.check(buffer)) return { error: "type" };
  return { buffer, originalName, mimeType: kind.mime, ext };
}

export const isInlineSafe = (mime: string) =>
  ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"].includes(mime);
