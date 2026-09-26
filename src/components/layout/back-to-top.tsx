"use client";

import { useLenis } from "@/components/motion/smooth-scroll";

export function BackToTop() {
  const lenis = useLenis();
  return (
    <button
      type="button"
      onClick={() => {
        if (lenis) lenis.scrollTo(0, { duration: 1.6 });
        else window.scrollTo({ top: 0, behavior: "smooth" });
        document.querySelector<HTMLElement>("#main")?.focus({ preventScroll: true });
      }}
      className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-fog-50"
    >
      Back to top <span aria-hidden="true">↑</span>
    </button>
  );
}
