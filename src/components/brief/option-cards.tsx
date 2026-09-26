"use client";

import { cn } from "@/lib/utils";

type Option = { value: string; label: string; hint?: string };

/** Accessible radio group styled as selectable cards / chips. */
export function OptionCards({
  name,
  legend,
  options,
  value,
  onChange,
  error,
  variant = "card",
  columns = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  name: string;
  legend: string;
  options: readonly Option[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string[];
  variant?: "card" | "chip";
  columns?: string;
}) {
  const errorId = error?.length ? `${name}-error` : undefined;
  return (
    <fieldset aria-describedby={errorId} aria-invalid={error?.length ? true : undefined}>
      <legend className="mb-4 text-sm font-medium text-fog-200">{legend}</legend>
      <div className={cn(variant === "card" ? `grid gap-3 ${columns}` : "flex flex-wrap gap-2")}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "group relative cursor-pointer select-none border transition-[border-color,background-color,transform] duration-300 ease-(--ease-out-expo) has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-flux active:scale-[0.98]",
                variant === "card" ? "flex flex-col gap-1 rounded-md p-4" : "flex h-11 items-center rounded-full px-5 text-sm",
                checked
                  ? "border-flux bg-flux/[0.08] text-fog-50"
                  : "border-line bg-ink-900/60 text-fog-200 hover:border-line-strong hover:bg-ink-850",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange?.(o.value)}
                required
                className="sr-only"
              />
              {variant === "card" && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute right-4 top-4 flex size-4 items-center justify-center rounded-full border transition-colors",
                    checked ? "border-flux bg-flux" : "border-line-strong",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full bg-ink-950 transition-transform", checked ? "scale-100" : "scale-0")} />
                </span>
              )}
              <span className={cn("font-medium", variant === "card" && "pr-6")}>{o.label}</span>
              {variant === "card" && o.hint && <span className="text-xs leading-relaxed text-fog-500">{o.hint}</span>}
            </label>
          );
        })}
      </div>
      {error?.length ? (
        <p id={errorId} role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-danger">
          <span aria-hidden="true" className="mt-[5px] size-1 shrink-0 rounded-full bg-danger" />
          {error[0]}
        </p>
      ) : null}
    </fieldset>
  );
}
