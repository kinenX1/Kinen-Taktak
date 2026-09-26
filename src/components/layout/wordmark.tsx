import Link from "next/link";
import { cn } from "@/lib/utils";

/** Motion mark: three accelerating bars — movement into a new era. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" aria-hidden="true" className={cn("h-[0.9em] w-auto", className)}>
      <path d="M2 18 7 2h3L5 18z" fill="currentColor" opacity="0.35" />
      <path d="M9 18 14 2h3.5L12.5 18z" fill="currentColor" opacity="0.65" />
      <path d="M16 18 21 2h5l-5 16z" fill="var(--color-flux)" />
    </svg>
  );
}

/** "MOVeRA" — the lowercase serif e marks the pivot from Movement to Era. */
export function Wordmark({ className, withMark = true }: { className?: string; withMark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-[-0.04em]", className)}>
      {withMark && <LogoMark />}
      <span aria-label="MovEra">
        <span aria-hidden="true">
          MOV<span className="accent-serif px-[0.02em] text-[1.12em] font-normal text-flux">e</span>RA
        </span>
      </span>
    </span>
  );
}

export function WordmarkLink({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="MovEra — home" className={cn("inline-flex text-xl text-fog-50", className)}>
      <Wordmark />
    </Link>
  );
}
