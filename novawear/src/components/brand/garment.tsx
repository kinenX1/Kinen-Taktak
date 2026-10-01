import type { CSSProperties } from "react";
import { isLightColor, type GarmentKind } from "@/config/shop";
import { cn } from "@/lib/utils";
import { LEOPARD_BODY } from "./logo";

const edge = { stroke: "#151514", strokeOpacity: 0.2, strokeWidth: 1.5, strokeLinejoin: "round" as const };

/** A small N used as a chest or thigh mark, drawn at (x, y) with height h. */
function MiniN({ x, y, h, fill }: { x: number; y: number; h: number; fill: string }) {
  const s = h / 84;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 84 L0 0 L22 0 L70 48 L70 0 L92 0 L92 84 L70 84 L22 36 L22 84 Z" fill={fill} />
    </g>
  );
}

/**
 * Flat-lay illustration of a garment in a 200 × 200 box, used when a product
 * has no photo yet. `back` shows the leopard print on hoodies and tees.
 */
export function Garment({
  kind,
  color,
  back,
  className,
  style,
}: {
  kind: GarmentKind;
  color: string;
  back?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const mark = isLightColor(color) ? "#151514" : "#ECE8DF";
  return (
    <svg viewBox="0 0 200 200" className={cn("block h-full w-full", className)} style={style} aria-hidden="true">
      {kind === "tee" && (
        <>
          <path d="M64 28 L84 20 Q100 34 116 20 L136 28 L176 58 L158 88 L140 78 L140 180 L60 180 L60 78 L42 88 L24 58 Z" fill={color} {...edge} />
          <path d="M84 20 Q100 38 116 20" fill="none" stroke="#151514" strokeOpacity="0.35" strokeWidth="2" />
          {back ? <BackPrint mark={mark} y={78} /> : <MiniN x={106} y={54} h={18} fill={mark} />}
        </>
      )}
      {kind === "pants" && (
        <>
          <path d="M64 14 L136 14 L152 188 L112 188 L100 70 L88 188 L48 188 Z" fill={color} {...edge} />
          <rect x="64" y="14" width="72" height="13" fill="#000" opacity="0.14" />
          <path d="M95 27 L91 54 M105 27 L109 54" stroke={mark} strokeWidth="2" strokeLinecap="round" />
          <MiniN x={120} y={150} h={16} fill={mark} />
        </>
      )}
      {kind === "shorts" && (
        <>
          <path d="M60 40 L140 40 L154 130 L110 136 L100 92 L90 136 L46 130 Z" fill={color} {...edge} />
          <rect x="60" y="40" width="80" height="13" fill="#000" opacity="0.14" />
          <path d="M95 53 L92 74 M105 53 L108 74" stroke={mark} strokeWidth="2" strokeLinecap="round" />
          <MiniN x={124} y={108} h={14} fill={mark} />
        </>
      )}
      {(kind === "hoodie" || kind === "jacket") && (
        <>
          <path
            d="M66 40 Q70 12 100 10 Q130 12 134 40 L140 44 L176 142 L156 150 L140 96 L140 186 L60 186 L60 96 L44 150 L24 142 L60 44 Z"
            fill={color}
            {...edge}
          />
          {back ? (
            <>
              <path d="M68 42 Q100 6 132 42 Q100 34 68 42 Z" fill="#000" opacity="0.18" />
              <BackPrint mark={mark} y={90} />
            </>
          ) : (
            <>
              <path d="M80 40 Q100 20 120 40 Q100 54 80 40 Z" fill="#000" opacity="0.25" />
              {kind === "jacket" ? (
                <path d="M100 48 L100 186" stroke={mark} strokeOpacity="0.6" strokeWidth="2" />
              ) : (
                <>
                  <path d="M94 50 L93 78 M106 50 L107 78" stroke={mark} strokeWidth="2" strokeLinecap="round" />
                  <path d="M76 134 L124 134 L132 166 L68 166 Z" fill="#000" opacity="0.12" />
                </>
              )}
              <MiniN x={kind === "jacket" ? 112 : 91} y={kind === "jacket" ? 70 : 92} h={18} fill={mark} />
            </>
          )}
        </>
      )}
      {kind === "pyjama" && (
        <>
          <path d="M62 30 L86 20 L100 44 L114 20 L138 30 L176 70 L158 92 L140 80 L140 180 L60 180 L60 80 L42 92 L24 70 Z" fill={color} {...edge} />
          <path d="M86 20 L100 44 L114 20 L106 17 L100 30 L94 17 Z" fill="#000" opacity="0.18" />
          <path d="M100 44 L100 180" stroke={mark} strokeOpacity="0.5" strokeWidth="1.5" />
          {[66, 94, 122, 150].map((cy) => (
            <circle key={cy} cx="100" cy={cy} r="3" fill={mark} />
          ))}
          <rect x="112" y="64" width="18" height="16" fill="none" stroke={mark} strokeWidth="1.5" />
          <g transform="translate(113 68) scale(0.08)">
            <path d={LEOPARD_BODY} fill="var(--color-leopard)" />
          </g>
        </>
      )}
    </svg>
  );
}

function BackPrint({ mark, y }: { mark: string; y: number }) {
  return (
    <>
      <g transform={`translate(62 ${y}) scale(0.38)`}>
        <path d={LEOPARD_BODY} fill="var(--color-leopard)" stroke={mark} strokeWidth="4" paintOrder="stroke" strokeLinejoin="round" />
      </g>
      <text
        x="100"
        y={y + 56}
        textAnchor="middle"
        fill={mark}
        style={{ fontFamily: "var(--font-sans)", fontWeight: 900, fontStretch: "62.5%", fontSize: 14, letterSpacing: 2 }}
      >
        NOVAWEAR
      </text>
    </>
  );
}
