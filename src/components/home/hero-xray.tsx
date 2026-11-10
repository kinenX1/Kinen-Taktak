"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";

type Box = { id: string; label: string; x: number; y: number; w: number; h: number };

/**
 * X-ray flashlight for the hero. Following a fine pointer, a lens turns the
 * area under the cursor into cyan "film" and draws the layout skeleton (each
 * `[data-xray]` element's tag and size, plus a blueprint grid). It pops in
 * with a short flash. Decorative only: pointer-events are off, it is hidden
 * from assistive technology and does not render on touch screens.
 */
export function HeroXRay({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setEnabled(fine.matches);
    sync();
    fine.addEventListener("change", sync);
    return () => fine.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const section = targetRef.current;
    const root = rootRef.current;
    if (!enabled || !section || !root) return;

    let active = false;
    let last: { cx: number; cy: number } | null = null;
    let frame = 0;
    let measured: Box[] = [];

    const measure = () => {
      const base = section.getBoundingClientRect();
      const next: Box[] = [];
      section.querySelectorAll<HTMLElement>("[data-xray]").forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        next.push({
          id: `${i}`,
          label: el.dataset.xray ?? el.tagName.toLowerCase(),
          x: r.left - base.left,
          y: r.top - base.top,
          w: r.width,
          h: r.height,
        });
      });
      measured = next;
      setBoxes(next);
    };

    const place = () => {
      if (!last) return;
      const base = section.getBoundingClientRect();
      const x = last.cx - base.left;
      const y = last.cy - base.top;
      root.style.setProperty("--xray-x", `${x}px`);
      root.style.setProperty("--xray-y", `${y}px`);
      if (readoutRef.current) {
        const hit = measured.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        readoutRef.current.textContent = `${hit ? `<${hit.label}> · ` : ""}X ${String(Math.round(x)).padStart(4, "0")} · Y ${String(Math.round(y)).padStart(4, "0")}`;
      }
    };

    const flash = () => {
      if (reduce) return;
      flashRef.current?.animate(
        [
          { opacity: 0.55, transform: "translate(-50%, -50%) scale(0.4)" },
          { opacity: 0, transform: "translate(-50%, -50%) scale(1.6)" },
        ],
        { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      last = { cx: e.clientX, cy: e.clientY };
      if (!active) {
        active = true;
        measure();
        root.dataset.active = "true";
        flash();
      }
      place();
    };

    const onLeave = () => {
      active = false;
      delete root.dataset.active;
    };

    // The hero content drifts on scroll, so re-measure while the lens is open.
    const onScrollOrResize = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        place();
      });
    };

    section.addEventListener("pointermove", onMove, { passive: true });
    section.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(frame);
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [enabled, reduce, targetRef]);

  if (!enabled) return null;

  return (
    <div ref={rootRef} aria-hidden="true" className="xray pointer-events-none absolute inset-0 z-20">
      {/* The "film": everything under the lens, desaturated and tinted cyan */}
      <div className="xray-film xray-mask absolute inset-0" />

      {/* The skeleton: blueprint grid, element boxes and a scan line */}
      <div className="xray-mask absolute inset-0">
        <div className="xray-grid absolute inset-0" />
        {boxes.map((b) => (
          <div
            key={b.id}
            className="absolute border border-dashed border-ion-soft/70"
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          >
            <span className="absolute -top-px left-0 -translate-y-full bg-ion px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink-950">
              {`<${b.label}>`}
            </span>
            <span className="absolute -bottom-px right-0 translate-y-full px-1 pt-0.5 font-mono text-[10px] leading-none text-ion-soft">
              {Math.round(b.w)}×{Math.round(b.h)}
            </span>
          </div>
        ))}
        <div className="xray-scan absolute inset-x-0 h-24 motion-reduce:hidden" />
      </div>

      {/* Lens rim with crosshair and coordinates */}
      <div className="xray-ring absolute">
        <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-ion-soft" />
        <span className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-ion-soft" />
        <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-ion-soft" />
        <span className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-ion-soft" />
        <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-flux" />
        <span className="absolute left-full top-full ml-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-ion-soft">
          X-ray · <span ref={readoutRef} />
        </span>
      </div>

      {/* Flash when the lens opens */}
      <div ref={flashRef} className="xray-flash absolute opacity-0" />
    </div>
  );
}
