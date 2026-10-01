import type { CSSProperties } from "react";
import { isLightColor } from "@/config/shop";
import { cn } from "@/lib/utils";

export type FigureLook = {
  skin: string;
  top: string;
  pants: string;
  /** Long sleeves for hoodies, jackets and pyjamas. */
  long?: boolean;
  hood?: boolean;
  hair?: boolean;
  joggers?: boolean;
  pyjama?: boolean;
};

export const skinTones = ["#3B2A20", "#5C3B28", "#6E4630", "#8A5A3C", "#A8714F", "#C99872", "#E0B48F"] as const;

/**
 * An illustrated model wearing NovaWear, drawn in a 120 × 340 box.
 * Used for the hero line-up, lookbook and anywhere a product has no photo yet.
 */
export function Figure({
  look,
  label,
  className,
  style,
}: {
  look: FigureLook;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { skin, top, pants, long, hood, hair, joggers, pyjama } = look;
  const patch = isLightColor(top) ? "#151514" : "#ECE8DF";
  const sleeve = long ? 122 : 46;
  return (
    <svg
      viewBox="0 0 120 340"
      className={cn("block h-full w-auto overflow-visible", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <ellipse cx="60" cy="333" rx="48" ry="6" fill="#000" opacity="0.14" />
      <rect x="12" y="70" width="18" height="128" rx="9" fill={skin} />
      <rect x="90" y="70" width="18" height="128" rx="9" fill={skin} />
      <rect x="9" y="64" width="24" height={sleeve} rx="11" fill={top} />
      <rect x="87" y="64" width="24" height={sleeve} rx="11" fill={top} />
      <path d="M25 176 L95 176 L99 318 L66 318 L60 222 L54 318 L21 318 Z" fill={pants} />
      <path d="M23 70 Q60 55 97 70 L99 186 L21 186 Z" fill={top} />
      {joggers && <path d="M53 186 L51 206 M67 186 L69 206" stroke="#F4F2EC" strokeWidth="2" strokeLinecap="round" />}
      {hood && <path d="M37 72 Q33 42 44 22 Q60 6 76 22 Q87 42 83 72 Q60 62 37 72 Z" fill={top} />}
      <rect x="52" y="44" width="16" height="22" rx="6" fill={skin} />
      <ellipse cx="60" cy="32" rx="16" ry="20" fill={skin} />
      {hair && !hood && <path d="M44 28 Q44 11 60 11 Q76 11 76 28 Q70 19 60 19 Q50 19 44 28 Z" fill="#0B0B0B" />}
      <rect x="43" y="27" width="34" height="8" rx="3" fill="#0B0B0B" />
      {hood && <path d="M54 72 L53 104 M66 72 L67 104" stroke="#F4F2EC" strokeWidth="2" strokeLinecap="round" />}
      {pyjama ? (
        <>
          <path d="M50 64 L60 84 L70 64" fill="none" stroke={patch} strokeWidth="2.5" />
          <path d="M60 84 L60 184" stroke={patch} strokeWidth="1.5" />
          <path d="M23 176 L97 176" stroke={patch} strokeWidth="1.5" opacity="0.6" />
        </>
      ) : (
        <rect x="64" y="88" width="20" height="9" rx="1.5" fill={patch} />
      )}
      <rect x="18" y="312" width="40" height="16" rx="8" fill="#F4F2EC" />
      <rect x="62" y="312" width="40" height="16" rx="8" fill="#F4F2EC" />
    </svg>
  );
}
