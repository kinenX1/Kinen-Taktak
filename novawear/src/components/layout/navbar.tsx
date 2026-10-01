"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { mainNav } from "@/config/site";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { LogoLink } from "@/components/brand/logo";
import { useBag } from "@/components/cart/cart-store";
import { Bag, Close, Menu, Search, User } from "@/components/ui/icons";
import { MobileMenu } from "./mobile-menu";
import { useSignedIn } from "./use-signed-in";

/** Sticky header that tucks away while scrolling down and returns on scroll up. */
export function Navbar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { count } = useBag();
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > 240 && y > prev && !open);
  });

  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (query) return pathname === path && params.toString() === query;
    return path === "/shop" ? pathname === "/shop" && !params.get("category") : pathname.startsWith(path!);
  };

  return (
    <>
      <motion.header
        animate={{ y: hidden ? "-100%" : "0%" }}
        transition={{ duration: 0.45, ease: ease.outExpo }}
        className={cn(
          "sticky top-0 border-b backdrop-blur-md transition-colors duration-500",
          open ? "z-[60] border-line-dark bg-ink text-bone" : "z-50 border-line bg-ground/90",
        )}
      >
        <nav aria-label="Main" className="container-x flex h-[4.5rem] items-center justify-between gap-6">
          <LogoLink ground={open ? "var(--color-ink)" : undefined} onClick={() => setOpen(false)} />
          <ul className="label hidden items-center gap-7 text-[0.875rem] lg:flex">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className="wipe py-2">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-0.5">
            <Link href="/shop#search" aria-label="Search the shop" className="hidden size-11 items-center justify-center rounded-full hover:bg-ink/[0.06] sm:flex">
              <Search size={21} />
            </Link>
            <Link
              href={signedIn ? "/account" : "/login"}
              aria-label={signedIn ? "Your account" : "Sign in"}
              className="flex size-11 items-center justify-center rounded-full hover:bg-ink/[0.06]"
            >
              <User size={21} />
            </Link>
            <Link href="/bag" aria-label={`Your bag, ${count} item${count === 1 ? "" : "s"}`} className="relative flex size-11 items-center justify-center rounded-full hover:bg-ink/[0.06]">
              <Bag size={21} />
              <AnimatePresence>
                {count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="absolute right-0 top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-leopard px-1 font-mono text-[11px] font-bold text-ink"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex size-11 items-center justify-center rounded-full hover:bg-current/10 lg:hidden"
            >
              {open ? <Close size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </nav>
      </motion.header>
      <AnimatePresence>{open && <MobileMenu signedIn={signedIn} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

export function NavbarFallback() {
  return <div className={cn("sticky top-0 z-50 h-[4.5rem] border-b border-line bg-ground/90")} />;
}
