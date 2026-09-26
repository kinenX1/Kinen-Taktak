"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { ease } from "@/lib/motion";
import { cn, initials } from "@/lib/utils";
import { WordmarkLink } from "@/components/layout/wordmark";
import * as Icons from "@/components/ui/icons";

export type ShellNavItem = { label: string; href: string; icon: keyof typeof Icons; badge?: number; exact?: boolean };

type Props = {
  nav: ShellNavItem[];
  user: { name: string; email: string; role: string };
  area: string;
  secondary?: { label: string; href: string };
  children: ReactNode;
};

/** Application frame shared by the client dashboard and the admin panel. */
export function AppShell({ nav, user, area, secondary, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prev, setPrev] = useState(pathname);
  if (prev !== pathname) {
    setPrev(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const isActive = (item: ShellNavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const sidebar = (inDrawer = false) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center justify-between px-5", inDrawer && "pr-16")}>
        <WordmarkLink className="text-lg" />
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.1em] text-fog-400">{area}</span>
      </div>
      <nav aria-label={`${area} navigation`} className="mt-4 flex-1 px-3">
        <ul className="space-y-0.5">
          {nav.map((item) => {
            const Icon = Icons[item.icon] as (p: { size?: number }) => ReactNode;
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                    active ? "bg-fog-50/[0.07] text-fog-50" : "text-fog-400 hover:bg-fog-50/[0.04] hover:text-fog-50",
                  )}
                >
                  {active && <motion.span layoutId={`${area}-nav`} className="absolute inset-y-2.5 left-0 w-[2px] rounded-full bg-flux" />}
                  <Icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span className="rounded-full bg-flux px-1.5 py-0.5 font-mono text-2xs leading-none text-ink-950">{item.badge}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {secondary && (
          <Link
            href={secondary.href}
            className="mt-6 flex h-10 items-center gap-2 rounded-md px-3 text-sm text-fog-500 transition-colors hover:text-fog-50"
          >
            <Icons.ArrowUpRight size={16} />
            {secondary.label}
          </Link>
        )}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-flux to-flux-deep text-xs font-semibold text-ink-950">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-fog-50">{user.name}</span>
            <span className="block truncate text-xs text-fog-500">{user.email}</span>
          </span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-fog-400 transition-colors hover:bg-fog-50/[0.04] hover:text-fog-50"
          >
            <Icons.LogOut size={18} />
            Log out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ink-950 lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-ink-900/60 lg:block">{sidebar()}</aside>

      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-ink-950/85 px-4 backdrop-blur-xl lg:hidden">
        <WordmarkLink className="text-lg" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-drawer"
          className="flex size-11 items-center justify-center rounded-full text-fog-50 hover:bg-fog-50/[0.06]"
        >
          <Icons.Menu size={20} />
          <span className="sr-only">Open navigation</span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              id="app-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.5, ease: ease.outExpo }}
              className="fixed inset-y-0 left-0 z-50 w-[84vw] max-w-xs border-r border-line bg-ink-900 lg:hidden"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-fog-400 hover:bg-fog-50/[0.06] hover:text-fog-50"
                aria-label="Close navigation"
                autoFocus
              >
                <Icons.Close size={18} />
              </button>
              {sidebar(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main id="main" tabIndex={-1} className="min-w-0 outline-none">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-12 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
