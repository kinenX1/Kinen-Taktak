import Image from "next/image";
import type { CSSProperties } from "react";
import type { VisualVariant } from "@prisma/client";
import { cn } from "@/lib/utils";

type Props = {
  variant: VisualVariant;
  accent: string;
  title: string;
  coverImage?: string | null;
  className?: string;
  /** Prioritise loading (above-the-fold covers). */
  priority?: boolean;
  sizes?: string;
};

/**
 * Cover art for portfolio projects. When a real `coverImage` exists it is
 * rendered with next/image; otherwise an art-directed interface composition
 * is generated from the project's accent colour. Parent elements with the
 * `group` class drive the hover motion.
 */
export function ProjectVisual({ variant, accent, title, coverImage, className, priority, sizes }: Props) {
  const style = { "--a": accent } as CSSProperties;

  if (coverImage) {
    return (
      <div className={cn("relative overflow-hidden bg-ink-800", className)}>
        <Image
          src={coverImage}
          alt={`${title} — project cover`}
          fill
          priority={priority}
          // Remote covers are served as-is so the optimizer can't be used as an open image proxy.
          unoptimized={coverImage.startsWith("http")}
          sizes={sizes ?? "(min-width: 1024px) 60vw, 100vw"}
          className="object-cover transition-transform duration-[1.4s] ease-(--ease-out-expo) group-hover:scale-[1.04]"
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${title} — illustrative interface composition`}
      style={style}
      className={cn("relative isolate overflow-hidden bg-ink-850 [container-type:inline-size]", className)}
    >
      {/* Lighting */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 transition-transform duration-[1.6s] ease-(--ease-out-expo) group-hover:scale-110"
        style={{
          background:
            "radial-gradient(60% 70% at 78% 18%, color-mix(in oklab, var(--a) 38%, transparent), transparent 70%), radial-gradient(50% 60% at 10% 100%, color-mix(in oklab, var(--a) 16%, transparent), transparent 70%)",
        }}
      />
      <div aria-hidden="true" className="grid-lines absolute inset-0 -z-10 opacity-40 [background-size:48px_48px]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-transform duration-[1.2s] ease-(--ease-out-expo) group-hover:-translate-y-[2%] group-hover:scale-[1.025]"
      >
        {variant === "BROWSER" && <BrowserArt />}
        {variant === "PHONE" && <PhoneArt />}
        {variant === "DASHBOARD" && <DashboardArt />}
        {variant === "COMMERCE" && <CommerceArt />}
        {variant === "SYSTEM" && <SystemArt />}
      </div>
    </div>
  );
}

const Bar = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <div className={cn("rounded-full bg-fog-50/15", className)} style={style} />
);
const AccentBar = ({ className }: { className?: string }) => (
  <div className={cn("rounded-full", className)} style={{ background: "var(--a)" }} />
);

function Window({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute overflow-hidden rounded-[1.2cqw] border border-fog-50/10 bg-ink-900/90 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <div className="flex h-[4.5cqw] items-center gap-[0.8cqw] border-b border-fog-50/[0.07] px-[1.6cqw]">
        <span className="size-[0.9cqw] rounded-full bg-fog-50/20" />
        <span className="size-[0.9cqw] rounded-full bg-fog-50/20" />
        <span className="size-[0.9cqw] rounded-full bg-fog-50/20" />
        <span className="mx-auto h-[1.8cqw] w-1/3 rounded-full bg-fog-50/[0.07]" />
      </div>
      {children}
    </div>
  );
}

function BrowserArt() {
  return (
    <Window className="inset-x-[9%] top-[12%] bottom-[-8%]">
      <div className="flex items-center justify-between px-[4cqw] pt-[3cqw]">
        <Bar className="h-[1.3cqw] w-[10cqw] bg-fog-50/40" />
        <div className="flex gap-[2cqw]">
          <Bar className="h-[1cqw] w-[5cqw]" />
          <Bar className="h-[1cqw] w-[5cqw]" />
          <Bar className="h-[1cqw] w-[5cqw]" />
        </div>
      </div>
      <div className="px-[4cqw] pt-[5cqw]">
        <div className="h-[4.2cqw] w-[70%] rounded-[0.6cqw] bg-fog-50/80" />
        <div className="mt-[1.4cqw] h-[4.2cqw] w-[48%] rounded-[0.6cqw] bg-fog-50/80" />
        <Bar className="mt-[3cqw] h-[1cqw] w-[40%]" />
        <Bar className="mt-[1cqw] h-[1cqw] w-[32%]" />
      </div>
      <div className="mt-[4cqw] grid grid-cols-3 gap-[1.6cqw] px-[4cqw]">
        <div className="col-span-2 aspect-[16/10] rounded-[0.8cqw]" style={{ background: "linear-gradient(135deg, var(--a), color-mix(in oklab, var(--a) 30%, #0a0c10))" }} />
        <div className="grid gap-[1.6cqw]">
          <div className="rounded-[0.8cqw] bg-fog-50/[0.08]" />
          <div className="rounded-[0.8cqw] bg-fog-50/[0.05]" />
        </div>
      </div>
    </Window>
  );
}

function Phone({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute aspect-[9/19] overflow-hidden rounded-[4.4cqw] border-[0.6cqw] border-ink-700 bg-ink-900 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]",
        className,
      )}
    >
      <div className="mx-auto mt-[1.4cqw] h-[1.6cqw] w-[30%] rounded-full bg-ink-700" />
      {children}
    </div>
  );
}

function PhoneArt() {
  return (
    <>
      <Phone className="left-[16%] top-[16%] w-[27%] rotate-[-6deg] opacity-80">
        <div className="space-y-[1.6cqw] p-[2.2cqw] pt-[3cqw]">
          <Bar className="h-[1.2cqw] w-1/2 bg-fog-50/40" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-[1.4cqw]">
              <div className="size-[4.6cqw] shrink-0 rounded-[1.2cqw] bg-fog-50/10" />
              <div className="flex-1 space-y-[0.8cqw]">
                <Bar className="h-[0.9cqw] w-3/4" />
                <Bar className="h-[0.9cqw] w-1/2 bg-fog-50/[0.08]" />
              </div>
            </div>
          ))}
        </div>
      </Phone>
      <Phone className="left-[47%] top-[8%] w-[31%] rotate-[4deg]">
        <div className="p-[2.2cqw] pt-[3cqw]">
          <div className="flex items-center justify-between">
            <Bar className="h-[1.2cqw] w-[40%] bg-fog-50/40" />
            <div className="size-[3.4cqw] rounded-full bg-fog-50/10" />
          </div>
          <div
            className="mt-[2.4cqw] aspect-[4/3] rounded-[2cqw]"
            style={{ background: "radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--a) 90%, white), var(--a) 45%, color-mix(in oklab, var(--a) 25%, #0a0c10))" }}
          />
          <Bar className="mt-[2.4cqw] h-[1.5cqw] w-3/4 bg-fog-50/70" />
          <Bar className="mt-[1cqw] h-[1cqw] w-1/2" />
          <div className="mt-[2.4cqw] grid grid-cols-2 gap-[1.2cqw]">
            <div className="aspect-square rounded-[1.4cqw] bg-fog-50/[0.08]" />
            <div className="aspect-square rounded-[1.4cqw] bg-fog-50/[0.05]" />
          </div>
          <AccentBar className="mt-[2.4cqw] h-[4.4cqw] w-full" />
        </div>
      </Phone>
    </>
  );
}

function DashboardArt() {
  return (
    <Window className="inset-x-[7%] top-[11%] bottom-[-10%]">
      <div className="flex h-full">
        <div className="w-[18%] space-y-[1.8cqw] border-r border-fog-50/[0.07] p-[2.4cqw]">
          <AccentBar className="h-[2.4cqw] w-[2.4cqw] rounded-[0.6cqw]" />
          {[70, 55, 80, 60, 45].map((w, i) => (
            <Bar key={i} className="h-[1cqw]" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex-1 p-[3cqw]">
          <div className="grid grid-cols-3 gap-[1.6cqw]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[0.8cqw] border border-fog-50/[0.07] p-[1.6cqw]">
                <Bar className="h-[0.8cqw] w-1/2" />
                <div className={cn("mt-[1.2cqw] h-[2.4cqw] w-3/4 rounded-[0.4cqw]", i === 0 ? "" : "bg-fog-50/60")} style={i === 0 ? { background: "var(--a)" } : undefined} />
              </div>
            ))}
          </div>
          <div className="mt-[2cqw] rounded-[0.8cqw] border border-fog-50/[0.07] p-[2cqw]">
            <svg viewBox="0 0 300 90" className="h-auto w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dash-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--a)" stopOpacity="0.45" />
                  <stop offset="1" stopColor="var(--a)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 70 C30 64 45 40 75 44 S120 70 150 52 195 18 225 26 270 8 300 12 V90 H0Z" fill="url(#dash-fill)" />
              <path d="M0 70 C30 64 45 40 75 44 S120 70 150 52 195 18 225 26 270 8 300 12" fill="none" stroke="var(--a)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="mt-[2cqw] space-y-[1.3cqw]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-[2cqw] border-b border-fog-50/[0.05] pb-[1.3cqw]">
                <div className="size-[2cqw] rounded-full bg-fog-50/10" />
                <Bar className="h-[0.9cqw] w-[30%]" />
                <Bar className="ml-auto h-[0.9cqw] w-[12%] bg-fog-50/[0.08]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

function CommerceArt() {
  return (
    <>
      <div className="absolute left-[8%] top-[14%] w-[46%]">
        <div
          className="aspect-[4/5] rounded-[1.4cqw]"
          style={{ background: "linear-gradient(160deg, color-mix(in oklab, var(--a) 35%, #13161c), #0e1015)" }}
        >
          <div className="flex h-full items-end justify-center pb-[12%]">
            {/* Abstract chair */}
            <svg viewBox="0 0 120 120" className="w-[62%]" fill="none">
              <path d="M30 20 Q30 14 36 14 H78 Q84 14 84 20 V62 H30 Z" fill="var(--a)" opacity="0.95" />
              <rect x="24" y="60" width="72" height="14" rx="5" fill="var(--a)" />
              <path d="M32 74 L28 112 M88 74 L92 112 M44 74 L42 104 M76 74 L78 104" stroke="#f4f2ec" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
      <div className="absolute right-[8%] top-[20%] w-[34%] space-y-[2cqw]">
        <Bar className="h-[1cqw] w-1/3" />
        <div className="h-[3.4cqw] w-full rounded-[0.5cqw] bg-fog-50/80" />
        <div className="h-[3.4cqw] w-2/3 rounded-[0.5cqw] bg-fog-50/80" />
        <div className="flex gap-[1.4cqw] pt-[1cqw]">
          {["var(--a)", "#d9d7d0", "#3a3f4a", "#7a5a3a"].map((c, i) => (
            <span key={i} className={cn("size-[4cqw] rounded-full border-[0.4cqw]", i === 0 ? "border-fog-50" : "border-transparent")} style={{ background: c }} />
          ))}
        </div>
        <div className="space-y-[1cqw] pt-[1cqw]">
          <Bar className="h-[0.9cqw] w-full" />
          <Bar className="h-[0.9cqw] w-5/6" />
        </div>
        <div className="flex items-center gap-[1.6cqw] pt-[1.6cqw]">
          <div className="h-[5cqw] flex-1 rounded-full" style={{ background: "var(--a)" }} />
          <div className="size-[5cqw] rounded-full border border-fog-50/20" />
        </div>
      </div>
      <div className="glass absolute bottom-[10%] right-[26%] flex items-center gap-[1.4cqw] rounded-[1.2cqw] px-[2cqw] py-[1.6cqw]">
        <div className="size-[3.4cqw] rounded-[0.8cqw]" style={{ background: "var(--a)" }} />
        <div className="space-y-[0.8cqw]">
          <Bar className="h-[0.9cqw] w-[12cqw] bg-fog-50/50" />
          <Bar className="h-[0.9cqw] w-[7cqw]" />
        </div>
      </div>
    </>
  );
}

function SystemArt() {
  return (
    <>
      <svg viewBox="0 0 400 250" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" fill="none">
        {/* Map blocks */}
        {Array.from({ length: 9 }).map((_, i) => (
          <path key={i} d={`M${i * 50 - 20} 0 L${i * 50 + 30} 250`} stroke="#f4f2ec" strokeOpacity="0.05" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <path key={i} d={`M0 ${i * 50} L400 ${i * 50 - 30}`} stroke="#f4f2ec" strokeOpacity="0.05" />
        ))}
        <path
          d="M40 200 C 90 190 100 130 150 128 S 230 160 260 110 S 330 60 370 50"
          stroke="var(--a)"
          strokeWidth="2.2"
          strokeDasharray="5 6"
          className="animate-dash"
        />
        <path d="M60 60 C 120 80 160 40 220 70 S 300 170 360 190" stroke="#8b9cff" strokeOpacity="0.6" strokeWidth="1.5" />
        {[
          [40, 200],
          [150, 128],
          [260, 110],
          [370, 50],
          [220, 70],
          [360, 190],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="9" fill="var(--a)" fillOpacity="0.15" />
            <circle cx={x} cy={y} r="3.5" fill={i % 2 ? "#f4f2ec" : "var(--a)"} />
          </g>
        ))}
      </svg>
      <div className="glass absolute right-[7%] top-[12%] w-[30%] space-y-[1.6cqw] rounded-[1.2cqw] p-[2.2cqw]">
        <Bar className="h-[1cqw] w-1/2 bg-fog-50/50" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-[1.2cqw]">
            <span className="size-[1.4cqw] rounded-full" style={{ background: i === 0 ? "var(--a)" : "rgb(244 242 236 / 0.2)" }} />
            <Bar className="h-[0.9cqw] flex-1" />
            <Bar className="h-[0.9cqw] w-[20%] bg-fog-50/[0.08]" />
          </div>
        ))}
      </div>
      <div className="glass absolute bottom-[12%] left-[8%] flex items-center gap-[1.6cqw] rounded-full px-[2.2cqw] py-[1.4cqw]">
        <span className="size-[1.6cqw] animate-pulse rounded-full" style={{ background: "var(--a)" }} />
        <Bar className="h-[0.9cqw] w-[14cqw] bg-fog-50/40" />
      </div>
    </>
  );
}
