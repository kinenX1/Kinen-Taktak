"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { mainNav } from "@/config/site";
import { ease } from "@/lib/motion";
import { Leopard } from "@/components/brand/logo";

export function MobileMenu({ signedIn, onClose }: { signedIn: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("a")?.focus();
    document.documentElement.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab" || !ref.current) return;
      // Keep focus inside the dialog (the toggle button stays reachable).
      const focusables = [
        document.querySelector<HTMLElement>('[aria-controls="mobile-menu"]'),
        ...ref.current.querySelectorAll<HTMLElement>("a, button"),
      ].filter(Boolean) as HTMLElement[];
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, []);

  const links = [...mainNav, { label: signedIn ? "My account" : "Sign in", href: signedIn ? "/account" : "/login" }, { label: "Bag", href: "/bag" }];

  return (
    <motion.div
      ref={ref}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      initial={{ clipPath: "circle(0% at calc(100% - 2.5rem) 2.25rem)" }}
      animate={{ clipPath: "circle(150% at calc(100% - 2.5rem) 2.25rem)" }}
      exit={{ clipPath: "circle(0% at calc(100% - 2.5rem) 2.25rem)" }}
      transition={{ duration: 0.8, ease: ease.inOutQuint }}
      className="fixed inset-0 z-[55] flex flex-col overflow-y-auto bg-ink text-bone lg:hidden"
    >
      <div aria-hidden="true" className="print animate-drift pointer-events-none absolute inset-0 opacity-[0.07] [--print-ink:var(--color-leopard)]" />
      <nav aria-label="Mobile" className="container-x relative flex flex-1 flex-col justify-center pb-10 pt-24">
        <ul>
          {links.map((item, i) => (
            <li key={item.href} className="overflow-hidden">
              <motion.div
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                exit={{ y: "110%", transition: { duration: 0.3 } }}
                transition={{ duration: 0.9, ease: ease.outExpo, delay: 0.2 + i * 0.05 }}
              >
                <Link href={item.href} onClick={onClose} className="display flex items-baseline gap-4 py-1 text-[clamp(3rem,15vw,5rem)]">
                  <span className="font-mono text-xs font-normal tracking-normal text-leopard">0{i + 1}</span>
                  {item.label}
                </Link>
              </motion.div>
            </li>
          ))}
        </ul>
      </nav>
      <div aria-hidden="true" className="relative h-20 overflow-hidden border-t border-line-dark">
        <div className="animate-run absolute bottom-3 left-0 w-28 [--run-duration:5s]">
          <div className="animate-gallop">
            <Leopard knockout="var(--color-ink)" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
