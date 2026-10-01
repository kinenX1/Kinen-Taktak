import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives. Every control is paired with a visible <label>, errors
 * are linked through aria-describedby and announced via aria-invalid.
 */

const control =
  "w-full border-[1.5px] border-line-strong bg-paper px-4 text-base text-ink placeholder:text-stone transition-[border-color,box-shadow] duration-200 hover:border-ink/50 focus:border-ink focus:outline-none focus:ring-4 focus:ring-leopard/40 aria-invalid:border-danger disabled:opacity-60";

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
      <label htmlFor={id} className="eyebrow flex items-baseline justify-between gap-3 text-body">
        <span>{label}</span>
        {optional && <span className="text-2xs text-stone">Optional</span>}
      </label>
      {children({ id, "aria-invalid": errors?.length ? true : undefined, "aria-describedby": describedBy })}
      {hint && !errors?.length && (
        <p id={hintId} className="text-xs leading-relaxed text-muted">
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
    <p id={id} className="flex items-start gap-1.5 text-sm leading-relaxed text-danger" role="alert">
      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 bg-danger" />
      {errors[0]}
    </p>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-13", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-32 resize-y py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-13 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("relative flex cursor-pointer items-start gap-3 text-[0.9375rem] text-body", className)}>
      <input
        type="checkbox"
        className="peer mt-0.5 size-5 shrink-0 cursor-pointer appearance-none border-2 border-ink bg-paper transition-colors checked:bg-ink"
        {...props}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute mt-0.5 size-5 scale-50 p-[3px] text-bone opacity-0 transition-[opacity,transform] peer-checked:scale-100 peer-checked:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
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
        "border-l-4 px-4 py-3 text-[0.9375rem] leading-relaxed",
        tone === "error" ? "border-danger bg-danger/[0.08] text-danger" : "border-success bg-success/[0.08] text-success",
      )}
    >
      {children}
    </div>
  );
}
