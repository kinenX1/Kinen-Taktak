"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { ease } from "@/lib/motion";
import { cn, initials } from "@/lib/utils";
import { NMark } from "@/components/brand/logo";
import * as Icons from "@/components/ui/icons";

export type AdminNavItem = { label: string; href: string; icon: keyof typeof Icons; badge?: number; exact?: boolean };

type Props = {
  nav: AdminNavItem[];
  user: { name: string; email: string };
  children: ReactNode;
};

/** Dark sidebar frame for the admin panel, with a drawer on small screens. */
export function AdminShell({ nav, user, children }: Props) {
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

  const isActive = (item: AdminNavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const brand = (
    <Link href="/admin" className="flex min-h-11 items-center gap-3">
      <NMark className="w-10" color="var(--color-bone)" ground="var(--color-ink-2)" />
      <span className="grid">
        <span className="display text-[1.6rem] leading-none">NovaWear</span>
        <span className="font-mono text-2xs uppercase tracking-[0.16em] text-leopard">Admin</span>
      </span>
    </Link>
  );

  const sidebar = (inDrawer = false) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-20 items-center px-5", inDrawer && "pr-16")}>{brand}</div>
      <nav aria-label="Admin" className="mt-2 flex-1 px-3">
        <ul className="space-y-1">
          {nav.map((item) => {
            const Icon = Icons[item.icon] as (p: { size?: number }) => ReactNode;
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-semibold transition-colors",
                    active ? "bg-bone text-ink" : "text-bone/80 hover:bg-bone/10 hover:text-bone",
                  )}
                >
                  <Icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && <span className="rounded-full bg-leopard px-1.5 py-0.5 font-mono text-2xs leading-none text-ink">{item.badge}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/" className="mt-6 flex h-10 items-center gap-2 rounded-md px-3 text-sm text-fog-2 transition-colors hover:text-leopard">
          <Icons.ArrowUpRight size={16} />
          View the store
        </Link>
      </nav>
      <div className="border-t border-line-dark p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-leopard text-xs font-bold text-ink">{initials(user.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-fog-2">{user.email}</span>
          </span>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="mt-1 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-fog hover:bg-bone/10 hover:text-bone">
            <Icons.LogOut size={18} />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ground lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh bg-ink-2 text-bone lg:block">{sidebar()}</aside>

      <div className="sticky top-0 z-40 flex h-16 items-center justify-between bg-ink-2 px-4 text-bone lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="admin-drawer" className="flex size-11 items-center justify-center rounded-full hover:bg-bone/10">
          <Icons.Menu size={22} />
          <span className="sr-only">Open navigation</span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-ink/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
            <motion.aside
              id="admin-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.5, ease: ease.outExpo }}
              className="fixed inset-y-0 left-0 z-50 w-[84vw] max-w-xs bg-ink-2 text-bone lg:hidden"
            >
              <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-5 flex size-10 items-center justify-center rounded-full hover:bg-bone/10" aria-label="Close navigation" autoFocus>
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

export function AdminHeader({ eyebrow, title, actions, children }: { eyebrow?: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-6">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[clamp(3rem,6vw,5rem)]">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-[0.9375rem] text-body">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
