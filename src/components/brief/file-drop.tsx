"use client";

import { useId, useRef, useState } from "react";
import { uploadRules } from "@/config/project-brief";
import { cn, formatBytes } from "@/lib/utils";
import { Close, FileIcon, Upload } from "@/components/ui/icons";

const accepted = uploadRules.accept.split(",");
const MAX = uploadRules.maxFileSizeMb * 1024 * 1024;

/** Drag-and-drop attachment picker. Files are held in state and appended on submit. */
export function FileDrop({
  files,
  onChange,
  error,
  existingCount = 0,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string[];
  existingCount?: number;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const remaining = uploadRules.maxFiles - existingCount;

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (!accepted.includes(ext)) {
        setLocalError(`${file.name} isn't a supported file type.`);
        continue;
      }
      if (file.size > MAX) {
        setLocalError(`${file.name} is larger than ${uploadRules.maxFileSizeMb} MB.`);
        continue;
      }
      if (next.length >= remaining) {
        setLocalError(`You can attach up to ${uploadRules.maxFiles} files.`);
        break;
      }
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const message = localError ?? error?.[0];

  return (
    <div>
      <p id={`${id}-label`} className="mb-3 flex items-baseline justify-between text-sm font-medium text-fog-200">
        Files
        <span className="font-mono text-2xs uppercase tracking-[0.12em] text-fog-500">Optional</span>
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          setLocalError(null);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors duration-300",
          dragging ? "border-flux bg-flux/[0.06]" : "border-line-strong bg-ink-900/40",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full border border-line text-fog-200">
          <Upload size={18} />
        </span>
        <p className="text-sm text-fog-200">
          Drag files here or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-flux underline-offset-4 hover:underline"
            aria-describedby={`${id}-hint`}
          >
            browse
          </button>
        </p>
        <p id={`${id}-hint`} className="text-xs text-fog-500">
          Images, PDFs and documents · up to {uploadRules.maxFiles} files · {uploadRules.maxFileSizeMb} MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={uploadRules.accept}
          className="sr-only"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          onChange={(e) => {
            setLocalError(null);
            add(e.target.files);
          }}
        />
      </div>
      {message && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {message}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Selected files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-md border border-line bg-ink-900 px-4 py-3 text-sm">
              <FileIcon size={16} className="shrink-0 text-fog-400" />
              <span className="min-w-0 flex-1 truncate text-fog-50">{f.name}</span>
              <span className="shrink-0 font-mono text-2xs text-fog-500">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-fog-400 transition-colors hover:bg-fog-50/10 hover:text-fog-50"
                aria-label={`Remove ${f.name}`}
              >
                <Close size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
