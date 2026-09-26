"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { mainNav } from "@/config/site";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { useLenis } from "@/components/motion/smooth-scroll";
import { WordmarkLink } from "./wordmark";
import { MobileMenu } from "./mobile-menu";
import { useSignedIn } from "./use-signed-in";

export function Navbar() {
  const pathname = usePathname();
  const signedIn = useSignedIn();
  const lenis = useLenis();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const last = useRef(0);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 24);
    const delta = y - last.current;
    if (Math.abs(delta) > 6) setHidden(delta > 0 && y > 240 && !open);
    last.current = y;
  });

  // Close the menu on navigation.
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (open) lenis?.stop();
    else lenis?.start();
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open, lenis]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: hidden ? "-110%" : 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: ease.outExpo }}
        className="fixed inset-x-0 top-0 z-50"
      >
        <div
          className={cn(
            "container-x flex h-(--nav-height) items-center justify-between gap-6 transition-[padding] duration-500",
            scrolled && "lg:pt-2",
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 -z-10 h-full transition-opacity duration-500",
              scrolled ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          >
            <div className="h-full bg-gradient-to-b from-ink-950/90 via-ink-950/60 to-transparent backdrop-blur-[2px] lg:hidden" />
          </div>

          <WordmarkLink className="relative z-10" />

          <nav aria-label="Main" className="hidden lg:block">
            <ul
              className={cn(
                "flex items-center gap-1 rounded-full p-1.5 transition-[background-color,border-color,box-shadow] duration-500",
                scrolled ? "glass shadow-[var(--shadow-float)]" : "border border-transparent",
              )}
            >
              {mainNav.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative z-10 flex h-9 items-center rounded-full px-4 text-sm transition-colors duration-300",
                        active ? "text-ink-950" : "text-fog-200 hover:text-fog-50",
                      )}
                    >
                      <span className="roll">
                        <span>{item.label}</span>
                        <span aria-hidden="true">{item.label}</span>
                      </span>
                    </Link>
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-full bg-fog-50"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href={signedIn ? "/dashboard" : "/login"}
              className="group flex h-9 items-center gap-2 rounded-full px-4 text-sm text-fog-200 transition-colors hover:text-fog-50"
            >
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" hidden={!signedIn} />
              <span className="roll">
                <span>{signedIn ? "Client Portal" : "Login"}</span>
                <span aria-hidden="true">{signedIn ? "Client Portal" : "Login"}</span>
              </span>
            </Link>
            <ButtonLink href="/start-project" size="sm" arrow>
              Start a Project
            </ButtonLink>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="relative z-[60] -mr-2 flex h-11 items-center gap-3 rounded-full px-3 text-sm font-medium text-fog-50 lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <span aria-hidden="true" className="roll">
              <span className={cn("transition-transform duration-500", open && "-translate-y-full")}>Menu</span>
              <span className={cn("transition-transform duration-500", open && "-translate-y-full")}>Close</span>
            </span>
            <span aria-hidden="true" className="relative block h-3 w-6">
              <span
                className={cn(
                  "absolute left-0 top-0 h-px w-6 bg-current transition-transform duration-500 ease-(--ease-out-expo)",
                  open && "translate-y-1.5 rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-px w-4 bg-current transition-all duration-500 ease-(--ease-out-expo)",
                  open && "w-6 -translate-y-1.5 -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && <MobileMenu signedIn={signedIn} onClose={() => setOpen(false)} isActive={isActive} />}
      </AnimatePresence>
    </>
  );
}
