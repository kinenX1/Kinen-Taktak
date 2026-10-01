import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight } from "./icons";
import { Spinner } from "./spinner";

type Variant = "primary" | "outline" | "leopard" | "light" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "group label relative inline-flex select-none items-center justify-center gap-3 overflow-hidden whitespace-nowrap transition-[background-color,color,border-color,transform] duration-300 ease-(--ease-snap) hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bone hover:bg-ink-3",
  outline: "border-2 border-ink text-ink hover:bg-ink hover:text-bone",
  leopard: "bg-leopard text-ink hover:bg-[#d69a43]",
  light: "bg-bone text-ink hover:bg-paper",
  ghost: "text-ink hover:bg-ink/[0.06]",
  danger: "border-2 border-danger text-danger hover:bg-danger hover:text-bone",
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-4 text-xs",
  md: "h-12 px-6 text-[0.8125rem]",
  lg: "h-14 px-8 text-sm",
};

type Common = {
  variant?: Variant;
  size?: Size;
  /** Adds an arrow that slides on hover. */
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
          <ArrowRight size={17} className="transition-transform duration-500 ease-(--ease-out-expo) group-hover:translate-x-5" />
          <ArrowRight
            size={17}
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

export function ButtonLink({ variant, size, arrow, className, children, ...props }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      <Content arrow={arrow}>{children}</Content>
    </Link>
  );
}
