"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\";

/**
 * Text that briefly "decodes" through random glyphs when `active` turns on —
 * a small HUD-style flourish for navigation. Width is locked to the final
 * text so layout never shifts, and screen readers only ever get the text.
 */
export function ScrambleText({ text, active, className }: { text: string; active: boolean; className?: string }) {
  const [display, setDisplay] = useState(text);
  const frame = useRef(0);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tick = 0;
    const total = text.length * 2 + 6;
    const step = () => {
      tick++;
      const revealed = Math.floor((tick / total) * text.length);
      setDisplay(
        text
          .split("")
          .map((ch, i) => (ch === " " || i < revealed ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (tick < total) frame.current = requestAnimationFrame(step);
      else setDisplay(text);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [active, text]);

  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <span className="invisible" aria-hidden="true">
        {text}
      </span>
      <span className="absolute inset-0 whitespace-nowrap" aria-hidden="true">
        {active ? display : text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
