import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadRules } from "@/config/project-brief";

/**
 * Local file storage for project brief attachments. Files live outside
 * /public and are only served through an authorised route handler.
 * For serverless hosting, replace these functions with an object-storage
 * implementation (S3, R2, GCS) keeping the same signatures.
 */

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");

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

export async function storeFile(file: ValidatedFile) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${randomUUID()}${file.ext}`;
  await writeFile(path.join(UPLOAD_DIR, storedName), file.buffer, { mode: 0o600 });
  return storedName;
}

function resolveStored(storedName: string) {
  // storedName comes from the DB, but guard against traversal regardless.
  const safe = path.basename(storedName);
  return path.join(UPLOAD_DIR, safe);
}

export function readStoredFile(storedName: string) {
  return readFile(resolveStored(storedName));
}

export async function deleteStoredFile(storedName: string) {
  await unlink(resolveStored(storedName)).catch(() => {});
}

export const isInlineSafe = (mime: string) =>
  ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"].includes(mime);
