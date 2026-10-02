import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OptionalTag } from "./optional-tag";

/**
 * Form primitives. Every control is paired with a visible <label>, errors
 * are linked through aria-describedby and announced via aria-invalid.
 */

const control =
  "w-full rounded-md border border-line bg-ink-900/70 px-4 text-[0.9375rem] text-fog-50 placeholder:text-fog-500 transition-[border-color,background-color,box-shadow] duration-200 hover:border-line-strong focus:border-flux/70 focus:bg-ink-850 focus:outline-none focus:ring-4 focus:ring-flux/10 aria-invalid:border-danger/70 aria-invalid:focus:ring-danger/10 disabled:opacity-60";

type FieldProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string[] | string;
  optional?: boolean;
  className?: string;
  children: (a11y: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  const errors = typeof error === "string" ? [error] : error;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-medium text-fog-200">
        <span>{label}</span>
        {optional && <OptionalTag />}
      </label>
      {children({ id, "aria-invalid": errors?.length ? true : undefined, "aria-describedby": describedBy })}
      {hint && !errors?.length && (
        <p id={hintId} className="text-xs leading-relaxed text-fog-500">
          {hint}
        </p>
      )}
      <FieldError id={errorId} errors={errors} />
    </div>
  );
}

export function FieldError({ id, errors }: { id?: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs leading-relaxed text-danger" role="alert">
      <span aria-hidden="true" className="mt-[5px] size-1 shrink-0 rounded-full bg-danger" />
      {errors[0]}
    </p>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-32 resize-y py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-12 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-fog-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("group relative flex cursor-pointer items-start gap-3 text-sm text-fog-400", className)}>
      <input
        type="checkbox"
        className="peer mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-ink-900 transition-colors checked:border-flux checked:bg-flux focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flux"
        {...props}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute mt-0.5 size-[18px] scale-50 p-[3px] text-ink-950 opacity-0 transition-[opacity,transform] peer-checked:scale-100 peer-checked:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      <span className="leading-relaxed">{label}</span>
    </label>
  );
}

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3 text-sm leading-relaxed",
        tone === "error" ? "border-danger/30 bg-danger/[0.07] text-[#ffb3bd]" : "border-success/30 bg-success/[0.07] text-[#a6f0cd]",
      )}
    >
      {children}
    </div>
  );
}
