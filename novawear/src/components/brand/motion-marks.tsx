import { useId } from "react";
import { cn } from "@/lib/utils";
import { Leopard, NMark, N_PATH } from "./logo";

/** A leopard galloping across its container, on a loop. */
export function Runner({ className, duration = 9, knockout }: { className?: string; duration?: number; knockout?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute left-0 animate-run", className)} style={{ ["--run-duration" as string]: `${duration}s` }}>
      <div className="animate-gallop">
        <Leopard knockout={knockout} />
      </div>
    </div>
  );
}

/** Circular text badge that slowly spins around the N. */
export function SpinBadge({
  text = "Pre-order now • Drop 01 • NovaWear •",
  className,
}: {
  text?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div aria-hidden="true" className={cn("relative aspect-square", className)}>
      <svg viewBox="0 0 200 200" className="size-full animate-spin-slow">
        <defs>
          <path id={`ring-${id}`} d="M100 100 m-76 0 a76 76 0 1 1 152 0 a76 76 0 1 1 -152 0" />
        </defs>
        <circle cx="100" cy="100" r="98" fill="var(--color-ink)" />
        <text style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, letterSpacing: 3.4, fill: "var(--color-bone)", textTransform: "uppercase" }}>
          <textPath href={`#ring-${id}`}>{text.toUpperCase()}</textPath>
        </text>
      </svg>
      <NMark className="absolute left-[32%] top-[34%] w-[36%]" color="var(--color-bone)" ground="var(--color-ink)" />
    </div>
  );
}

/** A thin ring of repeating text, used behind spotlight figures. */
export function TextRing({ text, className }: { text: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={cn("animate-spin-slow [animation-duration:30s]", className)}>
      <defs>
        <path id={`tr-${id}`} d="M100 100 m-90 0 a90 90 0 1 1 180 0 a90 90 0 1 1 -180 0" />
      </defs>
      <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-ink)" strokeOpacity="0.16" strokeWidth="0.6" />
      <text style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: 2.2, fill: "var(--color-muted)" }}>
        <textPath href={`#tr-${id}`}>{`${text} • `.repeat(Math.max(1, Math.floor(76 / (text.length + 3)))).toUpperCase()}</textPath>
      </text>
    </svg>
  );
}

/** The N with the leopard sprinting through it — the brand in motion. */
export function RunningMark({ ground, color = "var(--color-ink)", className }: { ground: string; color?: string; className?: string }) {
  return (
    <div className={cn("relative aspect-[114/100]", className)}>
      <svg viewBox="0 0 114 100" className="block size-full" role="img" aria-label="The NovaWear sign: an N with a leopard running through it">
        <path d={N_PATH} fill={color} />
      </svg>
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-0 top-[30%] w-full animate-through">
          <div className="animate-gallop">
            <Leopard knockout={ground} />
          </div>
        </div>
      </div>
    </div>
  );
}
