import { cn } from "@/lib/utils";

/**
 * A unique line-drawn glyph per service. Strokes draw themselves in and
 * accent parts move when the glyph (or an ancestor with `group`) is active.
 * Pass `active` to force the animated state.
 */
export function ServiceGlyph({
  slug,
  active,
  className,
}: {
  slug: string;
  active?: boolean;
  className?: string;
}) {
  const draw = cn(
    "[stroke-dasharray:1] [stroke-dashoffset:0] transition-[stroke-dashoffset] duration-[1.4s] ease-(--ease-out-expo)",
  );
  const move = cn(
    "transition-transform duration-[1.2s] ease-(--ease-out-expo)",
  );
  const on = active ? "is-on" : "";

  const common = {
    viewBox: "0 0 120 120",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: cn("glyph size-full overflow-visible text-fog-200", on, className),
  };

  switch (slug) {
    case "websites":
      return (
        <svg {...common}>
          <rect x="14" y="22" width="92" height="72" rx="6" pathLength={1} className={draw} />
          <path d="M14 36h92" pathLength={1} className={draw} />
          <circle cx="22" cy="29" r="1.6" fill="currentColor" />
          <circle cx="28" cy="29" r="1.6" fill="currentColor" />
          <path d="M26 50h40M26 58h28" className="text-fog-400" />
          <rect x="26" y="68" width="68" height="16" rx="3" className={cn("text-flux", move, "glyph-slide")} stroke="currentColor" />
        </svg>
      );
    case "web-apps":
      return (
        <svg {...common}>
          <rect x="14" y="20" width="92" height="80" rx="6" pathLength={1} className={draw} />
          <path d="M38 20v80" className="text-fog-400" />
          <path d="M20 32h12M20 40h12M20 48h12" className="text-fog-400" />
          <rect x="46" y="30" width="24" height="18" rx="3" />
          <rect x="74" y="30" width="24" height="18" rx="3" className={cn("text-flux", move, "glyph-pop")} stroke="currentColor" />
          <path d="M46 84 L58 70 L68 76 L82 58 L98 64" className={cn("text-flux")} pathLength={1} stroke="currentColor" />
        </svg>
      );
    case "mobile-apps":
      return (
        <svg {...common}>
          <rect x="38" y="12" width="44" height="96" rx="9" pathLength={1} className={draw} />
          <path d="M53 19h14" />
          <rect x="45" y="30" width="30" height="22" rx="4" className={cn("text-flux", move, "glyph-pop")} stroke="currentColor" />
          <path d="M45 62h30M45 70h20M45 78h26" className="text-fog-400" />
          <circle cx="60" cy="96" r="3" />
          <path d="M92 40c6 5 6 15 0 20M100 34c10 9 10 23 0 32" className={cn("text-flux opacity-0 transition-opacity duration-700", "glyph-fade")} stroke="currentColor" />
        </svg>
      );
    case "ui-ux-design":
      return (
        <svg {...common}>
          <path d="M18 92 C 34 30, 86 90, 102 28" pathLength={1} className={cn("text-flux", draw)} stroke="currentColor" />
          <path d="M18 92 L40 50 M102 28 L80 70" className="text-fog-400" strokeDasharray="2 3" />
          <rect x="36" y="46" width="8" height="8" rx="1.5" fill="#060709" />
          <rect x="76" y="66" width="8" height="8" rx="1.5" fill="#060709" />
          <circle cx="18" cy="92" r="4" fill="#060709" />
          <circle cx="102" cy="28" r="4" fill="#060709" />
          <path d="M62 60 l14 32 4-12 12-4z" className={cn(move, "glyph-cursor")} fill="#060709" />
        </svg>
      );
    case "custom-software":
      return (
        <svg {...common}>
          <path d="M28 30 L60 60 L92 30 M60 60 L60 94 M28 30 L28 76 L60 94 M92 30 L92 76 L60 94" className="text-fog-400" pathLength={1} />
          {[
            [28, 30],
            [92, 30],
            [60, 60],
            [28, 76],
            [92, 76],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill="#060709" />
          ))}
          <circle cx="60" cy="94" r="7" className={cn("text-flux", move, "glyph-pop")} fill="#060709" stroke="currentColor" />
        </svg>
      );
    case "e-commerce":
      return (
        <svg {...common}>
          <path d="M26 42 h68 l-6 56 H32z" pathLength={1} className={draw} />
          <path d="M44 42 v-8 a16 16 0 0 1 32 0 v8" />
          <g className={cn("text-flux", move, "glyph-tag")}>
            <path d="M74 64 h22 l8 10 -8 10 h-22z" stroke="currentColor" fill="#060709" />
            <circle cx="80" cy="74" r="2" fill="currentColor" stroke="none" />
          </g>
          <path d="M40 60h20M40 70h14" className="text-fog-400" />
        </svg>
      );
    case "saas":
      return (
        <svg {...common}>
          <path d="M60 20 L102 40 L60 60 L18 40z" className={cn("text-flux", move, "glyph-lift")} stroke="currentColor" fill="#060709" />
          <path d="M18 58 L60 78 L102 58" pathLength={1} className={draw} />
          <path d="M18 76 L60 96 L102 76" className="text-fog-400" />
        </svg>
      );
    case "automation":
      return (
        <svg {...common}>
          <g className={cn(move, "glyph-spin origin-[44px_60px]")}>
            <circle cx="44" cy="60" r="16" />
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <path
                  key={i}
                  d={`M${44 + Math.cos(a) * 16} ${60 + Math.sin(a) * 16} L${44 + Math.cos(a) * 22} ${60 + Math.sin(a) * 22}`}
                />
              );
            })}
            <circle cx="44" cy="60" r="5" />
          </g>
          <path d="M70 44 C 90 44 96 50 96 60 C 96 70 90 76 70 76" className="text-flux" stroke="currentColor" pathLength={1} />
          <path d="M76 70 l-6 6 6 6" className="text-flux" stroke="currentColor" />
        </svg>
      );
    case "ai-products":
      return (
        <svg {...common}>
          {[
            [24, 36],
            [24, 60],
            [24, 84],
            [60, 28],
            [60, 60],
            [60, 92],
            [96, 48],
            [96, 72],
          ].flatMap(([x, y], i, all) =>
            all
              .filter(([x2]) => x2 === x! + 36)
              .map(([x2, y2], j) => (
                <path key={`${i}-${j}`} d={`M${x} ${y} L${x2} ${y2}`} className="text-fog-500" strokeWidth={0.8} />
              )),
          )}
          {[
            [24, 36],
            [24, 60],
            [24, 84],
            [60, 28],
            [60, 60],
            [60, 92],
            [96, 48],
            [96, 72],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.5" fill="#060709" className={i === 4 ? "text-flux" : undefined} stroke="currentColor" />
          ))}
          <path d="M60 46v-6M60 80v-6M46 60h-6M80 60h-6" className={cn("text-flux opacity-0 transition-opacity duration-700 glyph-fade")} stroke="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="36" pathLength={1} className={draw} />
          <circle cx="60" cy="60" r="6" className="text-flux" stroke="currentColor" />
        </svg>
      );
  }
}
