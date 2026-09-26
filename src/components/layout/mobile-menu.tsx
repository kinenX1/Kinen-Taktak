"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { mainNav, siteConfig } from "@/config/site";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "@/components/ui/icons";

export function MobileMenu({
  signedIn,
  onClose,
  isActive,
}: {
  signedIn: boolean;
  onClose: () => void;
  isActive: (href: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("a")?.focus();

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
      previouslyFocused?.focus();
    };
  }, []);

  const links = [...mainNav, { label: "Start a Project", href: "/start-project" }];

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
      className="grain fixed inset-0 z-[45] flex flex-col overflow-y-auto bg-ink-900 lg:hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-1/3 top-1/4 size-[120vw] rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.16),transparent_60%)]"
      />
      <nav aria-label="Mobile" className="container-x relative flex flex-1 flex-col justify-center pt-24 pb-10">
        <ul className="space-y-1">
          {links.map((item, i) => (
            <li key={item.href} className="overflow-hidden">
              <motion.div
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                exit={{ y: "110%", transition: { duration: 0.3 } }}
                transition={{ duration: 0.9, ease: ease.outExpo, delay: 0.25 + i * 0.06 }}
              >
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "group flex items-baseline gap-4 py-1 text-[clamp(2.5rem,12vw,4.5rem)] font-medium leading-[1.02] tracking-[-0.05em]",
                    item.href === "/start-project" ? "text-flux" : isActive(item.href) ? "text-fog-50" : "text-fog-400",
                  )}
                >
                  <span className="font-mono text-xs tracking-normal text-fog-500">0{i + 1}</span>
                  <span className="transition-transform duration-500 group-active:translate-x-2">{item.label}</span>
                </Link>
              </motion.div>
            </li>
          ))}
        </ul>
      </nav>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.6, ease: ease.outExpo }}
        className="container-x relative flex flex-wrap items-center justify-between gap-4 border-t border-line py-6 text-sm"
      >
        <Link href={signedIn ? "/dashboard" : "/login"} onClick={onClose} className="flex min-h-11 items-center gap-2 text-fog-50">
          {signedIn ? "Client Portal" : "Login"} <ArrowUpRight size={16} />
        </Link>
        <a href={`mailto:${siteConfig.email}`} className="flex min-h-11 items-center text-fog-400">
          {siteConfig.email}
        </a>
      </motion.div>
    </motion.div>
  );
}
