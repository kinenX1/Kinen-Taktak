import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight } from "./icons";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const base =
  "group relative inline-flex select-none items-center justify-center gap-2.5 overflow-hidden whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background-color,color,border-color,box-shadow,transform] duration-300 ease-(--ease-out-expo) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-flux text-ink-950 hover:bg-flux-soft hover:shadow-[var(--glow-flux)]",
  secondary:
    "border border-line-strong text-fog-50 hover:border-fog-50/60 hover:bg-fog-50/[0.04]",
  ghost: "text-fog-200 hover:bg-fog-50/[0.06] hover:text-fog-50",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  light: "bg-fog-50 text-ink-950 hover:bg-white",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

type Common = {
  variant?: Variant;
  size?: Size;
  /** Adds a sliding arrow that moves on hover. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

function Content({ children, arrow, pending }: { children: ReactNode; arrow?: boolean; pending?: boolean }) {
  return (
    <>
      {pending && <Spinner />}
      <span className="roll">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
      {arrow && !pending && (
        <span className="relative -mr-1 inline-flex size-5 items-center justify-center overflow-hidden">
          <ArrowRight
            size={16}
            className="transition-transform duration-500 ease-(--ease-out-expo) group-hover:translate-x-5"
          />
          <ArrowRight
            size={16}
            className="absolute -translate-x-5 transition-transform duration-500 ease-(--ease-out-expo) group-hover:translate-x-0"
          />
        </span>
      )}
    </>
  );
}

export function buttonClasses({ variant = "primary", size = "md", className }: Omit<Common, "children">) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  arrow,
  className,
  children,
  pending,
  ...props
}: Common & ComponentProps<"button"> & { pending?: boolean }) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      {...props}
    >
      <Content arrow={arrow} pending={pending}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  arrow,
  className,
  children,
  ...props
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      <Content arrow={arrow}>{children}</Content>
    </Link>
  );
}
