"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const LenisContext = createContext<Lenis | null>(null);
export const useLenis = () => useContext(LenisContext);

/**
 * Inertial smooth scrolling for the marketing site. Disabled entirely when
 * the visitor prefers reduced motion; touch devices keep native scrolling.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const instance = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, anchors: { offset: -80 } });
    let frame = requestAnimationFrame(function raf(time) {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    });
    setLenis(instance);

    const onChange = () => media.matches && instance.destroy();
    media.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", onChange);
      instance.destroy();
      setLenis(null);
    };
  }, []);

  // Start every route at the top.
  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true });
  }, [pathname, lenis]);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
