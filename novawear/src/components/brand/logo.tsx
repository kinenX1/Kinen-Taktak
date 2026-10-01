import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Silhouette of the running leopard, drawn in a 200 × 80 box facing right. */
export const LEOPARD_BODY =
  "M52 30 C75 22 110 20 132 24 C140 20 148 14 158 12 L160 5 L167 10 C175 10 182 14 186 20 L187 25 C180 28 172 30 164 31 C158 34 154 38 152 42 C162 46 176 50 194 54 L196 59 C180 59 164 56 148 52 C130 50 100 50 82 48 C70 52 50 58 12 66 L8 62 C30 54 44 46 48 40 C40 36 28 28 14 30 C8 31 4 28 6 25 C20 21 36 25 52 30 Z";
const LEOPARD_FAR_FRONT = "M140 44 C150 52 160 60 176 66 L178 71 C162 69 148 62 134 52 Z";
const LEOPARD_FAR_BACK = "M72 46 C62 56 46 64 28 72 L24 69 C40 60 54 50 62 42 Z";
const SPOTS: [number, number, number][] = [
  [62, 34, 2.2], [76, 29, 2.4], [90, 27, 2.2], [104, 28, 2.6], [118, 27, 2.2], [72, 40, 2],
  [88, 37, 2.4], [102, 40, 2.2], [116, 37, 2], [130, 33, 2], [140, 40, 1.8], [30, 27, 1.6], [18, 27, 1.4],
];

/** The N letterform in a 114 × 100 box. */
export const N_PATH = "M8 92 L8 8 L32 8 L84 60 L84 8 L106 8 L106 92 L82 92 L30 40 L30 92 Z";

type LeopardProps = {
  className?: string;
  style?: CSSProperties;
  /** Spot and eye colour. */
  spots?: string;
  /** Draws an outline in this colour to cut the leopard out of what's behind. */
  knockout?: string;
  detailed?: boolean;
};

export function Leopard({ className, style, spots = "var(--color-ink)", knockout, detailed = true }: LeopardProps) {
  return (
    <svg viewBox="0 0 200 80" className={cn("block overflow-visible", className)} style={style} aria-hidden="true">
      {detailed && (
        <>
          <path d={LEOPARD_FAR_FRONT} fill="var(--color-leopard-deep)" />
          <path d={LEOPARD_FAR_BACK} fill="var(--color-leopard-deep)" />
        </>
      )}
      <path
        d={LEOPARD_BODY}
        fill="var(--color-leopard)"
        {...(knockout ? { stroke: knockout, strokeWidth: 7, paintOrder: "stroke", strokeLinejoin: "round" as const } : {})}
      />
      <g fill={spots}>
        {(detailed ? SPOTS : SPOTS.slice(0, 9)).map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
        <circle cx="174" cy="17" r="1.6" />
      </g>
    </svg>
  );
}

/** The NovaWear sign: an N with a leopard running through it. */
export function NMark({
  className,
  color = "currentColor",
  ground = "var(--color-ground)",
  label,
}: {
  className?: string;
  color?: string;
  /** Background colour behind the mark, used to cut the leopard out. */
  ground?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 114 100"
      className={cn("block overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={N_PATH} fill={color} />
      <g transform="translate(-4 30) scale(0.6)">
        <path d={LEOPARD_BODY} fill="var(--color-leopard)" stroke={ground} strokeWidth="9" paintOrder="stroke" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("display text-[1.9rem] leading-none tracking-[0.02em]", className)}>NovaWear</span>;
}

export function LogoLink({ className, ground, onClick }: { className?: string; ground?: string; onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} aria-label="NovaWear home" className={cn("flex min-h-11 items-center gap-3", className)}>
      <NMark className="w-11" ground={ground} />
      <Wordmark />
    </Link>
  );
}
