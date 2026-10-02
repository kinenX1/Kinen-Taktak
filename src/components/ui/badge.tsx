import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-line-strong text-fog-400",
  info: "border-ion/30 bg-ion/[0.08] text-ion-soft",
  accent: "border-flux/30 bg-flux/[0.08] text-flux-soft",
  success: "border-success/30 bg-success/[0.08] text-success",
  danger: "border-danger/30 bg-danger/[0.08] text-danger",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-mono text-2xs uppercase tracking-[0.1em]",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
