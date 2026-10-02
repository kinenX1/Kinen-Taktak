"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { mainNav } from "@/config/site";
import { useI18n } from "@/i18n/client";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/avatar";
import { useLenis } from "@/components/motion/smooth-scroll";
import { ScrambleText } from "@/components/motion/scramble-text";
import { WordmarkLink } from "./wordmark";
import { MobileMenu } from "./mobile-menu";
import { AccountMenu, type NavUser } from "./account-menu";
import { LanguageSwitch } from "./language-switch";
import { HudClock } from "./hud-clock";

/**
 * Site navigation: a floating glass "HUD" bar with a scroll progress beam,
 * a hover light that glides between links, decoding link labels and the
 * signed-in user's photo in the top-right corner.
 */
export function Navbar({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const lenis = useLenis();
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
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
      {/* Scroll progress beam */}
      <motion.div
        aria-hidden="true"
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-flux via-flux-soft to-ion shadow-[0_0_12px_rgb(255_90_31/0.8)]"
      />

      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: hidden ? "-110%" : 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: ease.outExpo }}
        className="fixed inset-x-0 top-0 z-50"
      >
        <div
          className={cn(
            "container-x flex h-(--nav-height) items-center justify-between gap-4 transition-[padding] duration-500",
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

          <div className="relative z-10 flex items-center gap-5">
            <WordmarkLink />
            <HudClock className="hidden 2xl:flex" />
          </div>

          <nav aria-label={t.nav.main} className="hidden lg:block">
            <ul
              onPointerLeave={() => setHovered(null)}
              className={cn(
                "hud-corners relative flex items-center gap-0.5 rounded-full p-1.5 transition-[background-color,border-color,box-shadow] duration-500",
                scrolled ? "glass shadow-[var(--shadow-float)]" : "border border-line/60 bg-ink-950/20 backdrop-blur-sm",
              )}
            >
              {mainNav.map((item, i) => {
                const active = isActive(item.href);
                const label = t.nav[item.key];
                return (
                  <li key={item.href} className="relative" onPointerEnter={() => setHovered(item.href)}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onFocus={() => setHovered(item.href)}
                      onBlur={() => setHovered(null)}
                      className={cn(
                        "relative z-10 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors duration-300 xl:px-4",
                        active ? "text-ink-950" : "text-fog-200 hover:text-fog-50",
                      )}
                    >
                      <span aria-hidden="true" className={cn("hidden font-mono text-[0.5625rem] tracking-[0.1em] xl:inline", active ? "text-ink-950/50" : "text-fog-500")}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <ScrambleText text={label} active={hovered === item.href && !active} />
                    </Link>
                    {hovered === item.href && !active && (
                      <motion.span
                        layoutId="nav-hover"
                        className="absolute inset-0 rounded-full border border-fog-50/15 bg-fog-50/[0.07]"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="nav-active-pill absolute inset-0 overflow-hidden rounded-full bg-fog-50"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      >
                        <span aria-hidden="true" className="absolute -bottom-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-flux shadow-[0_0_10px_2px_rgb(255_90_31/0.9)]" />
                      </motion.span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden items-center gap-2.5 lg:flex">
            <LanguageSwitch id="nav-lang" />
            {user ? (
              <>
                <ButtonLink href="/start-project" size="sm" arrow className="hidden xl:inline-flex">
                  {t.nav.startProject}
                </ButtonLink>
                <AccountMenu user={user} showLanguage={false} />
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="group flex h-9 items-center gap-2 rounded-full px-3 text-sm text-fog-200 transition-colors hover:text-fog-50"
                >
                  <span className="roll">
                    <span>{t.nav.login}</span>
                    <span aria-hidden="true">{t.nav.login}</span>
                  </span>
                </Link>
                <ButtonLink href="/start-project" size="sm" arrow>
                  {t.nav.startProject}
                </ButtonLink>
              </>
            )}
          </div>

          <div className="relative z-[60] flex items-center gap-1 lg:hidden">
            {user && !open && (
              <Link href="/dashboard" aria-label={t.nav.dashboard} className="flex size-11 items-center justify-center rounded-full">
                <UserAvatar name={user.name} src={user.avatar} size={34} ring />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="-mr-2 flex h-11 items-center gap-3 rounded-full px-3 text-sm font-medium text-fog-50"
            >
              <span className="sr-only">{open ? t.nav.closeMenu : t.nav.openMenu}</span>
              <span aria-hidden="true" className="roll">
                <span className={cn("transition-transform duration-500", open && "-translate-y-full")}>{t.nav.menu}</span>
                <span className={cn("transition-transform duration-500", open && "-translate-y-full")}>{t.nav.close}</span>
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
        </div>
      </motion.header>

      <AnimatePresence>{open && <MobileMenu user={user} onClose={() => setOpen(false)} isActive={isActive} />}</AnimatePresence>
    </>
  );
}
