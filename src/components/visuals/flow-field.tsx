"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Particle density multiplier. */
  density?: number;
  /** Draw the connected-node constellation. */
  nodes?: boolean;
  accent?: string;
};

type Particle = { x: number; y: number; life: number; hot: boolean; speed: number };
type Node = { x: number; y: number; vx: number; vy: number; r: number };

const INK = "6, 7, 9";

/**
 * "Movement + Era" hero visual: particles stream through a slowly evolving
 * flow field (movement) while a constellation of nodes drifts and links up
 * (an ecosystem being built). Canvas-only, no dependencies.
 *
 * Performance: DPR capped at 1.5, particle count scales with area, the loop
 * pauses when off-screen or the tab is hidden, and reduced-motion users get
 * a single pre-rendered still frame.
 */
export function FlowField({ className, density = 1, nodes = true, accent = "255, 90, 31" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let constellation: Node[] = [];
    let frame = 0;
    let running = false;
    let visible = true;
    let t = Math.random() * 1000;
    const pointer = { x: -9999, y: -9999, active: false };

    const angleAt = (x: number, y: number) => {
      const s = 0.0017;
      return (
        Math.sin(x * s + t * 0.12) * 1.3 +
        Math.cos(y * s * 1.3 - t * 0.09) * 1.1 +
        Math.sin((x + y) * s * 0.55 + t * 0.05) * 0.9 -
        0.35
      );
    };

    const spawn = (p?: Particle): Particle => {
      const target = p ?? ({} as Particle);
      target.x = Math.random() * width;
      target.y = Math.random() * height;
      target.life = 80 + Math.random() * 220;
      target.hot = Math.random() < 0.075;
      target.speed = 0.6 + Math.random() * 1.1;
      return target;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = width * height;
      const count = Math.round(Math.min(coarse ? 260 : 900, (area / 1700) * density));
      particles = Array.from({ length: count }, () => spawn());

      const nodeCount = nodes ? Math.round(Math.min(coarse ? 10 : 22, area / 52000)) : 0;
      constellation = Array.from({ length: nodeCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1.2 + Math.random() * 1.6,
      }));
      ctx.clearRect(0, 0, width, height);
    };

    const step = () => {
      t += 0.016;

      // Fade the previous frame to leave motion trails.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.075)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      ctx.lineWidth = 1;
      for (const p of particles) {
        let a = angleAt(p.x, p.y);
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 22000) a += (1 - d2 / 22000) * 2.4; // swirl around the cursor
        }
        const nx = p.x + Math.cos(a) * p.speed * 1.4;
        const ny = p.y + Math.sin(a) * p.speed * 1.4;
        ctx.strokeStyle = p.hot ? `rgba(${accent}, 0.75)` : "rgba(244, 242, 236, 0.16)";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.x = nx;
        p.y = ny;
        p.life -= 1;
        if (p.life <= 0 || p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) spawn(p);
      }

      if (constellation.length) {
        const maxD = Math.min(260, width * 0.22);
        for (const n of constellation) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
        for (let i = 0; i < constellation.length; i++) {
          const a = constellation[i]!;
          for (let j = i + 1; j < constellation.length; j++) {
            const b = constellation[j]!;
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < maxD) {
              ctx.strokeStyle = `rgba(139, 156, 255, ${(1 - d / maxD) * 0.22})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          if (pointer.active) {
            const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
            if (d < maxD * 1.3) {
              ctx.strokeStyle = `rgba(${accent}, ${(1 - d / (maxD * 1.3)) * 0.5})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(pointer.x, pointer.y);
              ctx.stroke();
            }
          }
          ctx.fillStyle = `rgba(${INK}, 1)`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r + 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(244, 242, 236, 0.9)";
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const loop = () => {
      step();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduceMotion || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    resize();
    if (reduceMotion) {
      for (let i = 0; i < 160; i++) step(); // settle into a still composition
    } else {
      start();
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion) for (let i = 0; i < 160; i++) step();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= width && pointer.y <= height;
    };
    const onLeave = () => (pointer.active = false);
    if (!coarse) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [density, nodes, accent]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("block size-full", className)} />;
}
