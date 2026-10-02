"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/actions/auth";
import { useI18n } from "@/i18n/client";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/avatar";
import * as Icons from "@/components/ui/icons";
import { LanguageSwitch } from "./language-switch";

export type NavUser = { name: string; email: string; role: string; avatar: string | null; unread?: number };

/**
 * Profile picture in the top-right corner. Opens a panel with the account
 * shortcuts, the language switch and log out.
 */
export function AccountMenu({ user, showLanguage = true, align = "right" }: { user: NavUser; showLanguage?: boolean; align?: "right" | "left" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: "/dashboard", label: t.nav.dashboard, icon: "Grid" as const },
    { href: "/dashboard/projects", label: t.nav.myProjects, icon: "Briefcase" as const },
    { href: "/dashboard/messages", label: t.nav.messages, icon: "Inbox" as const, badge: user.unread },
    { href: "/dashboard/profile", label: t.nav.profile, icon: "User" as const },
    { href: "/dashboard/settings", label: t.nav.settings, icon: "Settings" as const },
    ...(user.role === "ADMIN" ? [{ href: "/admin", label: t.nav.adminPanel, icon: "Layers" as const }] : []),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t.nav.accountMenu} — ${user.name}`}
        className="group relative flex size-11 items-center justify-center rounded-full transition-transform duration-500 ease-(--ease-out-expo) hover:scale-105 active:scale-95"
      >
        <UserAvatar name={user.name} src={user.avatar} size={40} ring />
        <span aria-hidden="true" className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full border-2 border-ink-950 bg-success" />
        {!!user.unread && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-flux px-1 font-mono text-2xs text-ink-950 shadow-[var(--glow-flux)]">
            {user.unread > 9 ? "9+" : user.unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.18 } }}
            transition={{ duration: 0.45, ease: ease.outExpo }}
            className={cn(
              "hud-corners absolute top-[calc(100%+0.75rem)] z-[70] w-72 origin-top-right overflow-hidden rounded-xl border border-line-strong bg-ink-900/95 p-2 shadow-[var(--shadow-float)] backdrop-blur-2xl",
              align === "right" ? "right-0" : "left-0 origin-top-left",
            )}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-[radial-gradient(circle,rgb(255_90_31/0.22),transparent_65%)]" />
            <div className="relative flex items-center gap-3 rounded-lg px-3 py-3">
              <UserAvatar name={user.name} src={user.avatar} size={44} />
              <div className="min-w-0">
                <p className="eyebrow text-[0.625rem]">{t.nav.signedInAs}</p>
                <p className="truncate text-sm font-medium text-fog-50">{user.name}</p>
                <p className="truncate text-xs text-fog-500">{user.email}</p>
              </div>
            </div>
            <div className="mx-3 my-1 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
            <ul className="relative py-1">
              {links.map((l, i) => {
                const Icon = Icons[l.icon];
                return (
                  <motion.li key={l.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.4, ease: ease.outExpo }}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="group/item flex h-10 items-center gap-3 rounded-md px-3 text-sm text-fog-200 transition-colors hover:bg-fog-50/[0.06] hover:text-fog-50"
                    >
                      <Icon size={16} className="text-fog-500 transition-colors group-hover/item:text-flux" />
                      <span className="flex-1">{l.label}</span>
                      {!!l.badge && <span className="rounded-full bg-flux px-1.5 py-0.5 font-mono text-2xs leading-none text-ink-950">{l.badge}</span>}
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
            {showLanguage && (
              <>
                <div className="mx-3 my-1 h-px bg-line" />
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-fog-500">{t.nav.language}</span>
                  <LanguageSwitch id="account-lang" />
                </div>
              </>
            )}
            <div className="mx-3 my-1 h-px bg-line" />
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-fog-400 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Icons.LogOut size={16} />
                {t.nav.logout}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
