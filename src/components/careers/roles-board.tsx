"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { OpeningItem } from "@/lib/data/content";
import { fmt } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Clock, MapPin } from "@/components/ui/icons";

type Role = Pick<OpeningItem, "slug" | "title" | "team" | "location" | "employmentType" | "workMode" | "summary">;

/** Filterable list of open roles. Each row reveals its summary on hover. */
export function RolesBoard({ roles }: { roles: Role[] }) {
  const t = useT();
  const c = t.careers;
  const teams = [...new Set(roles.map((r) => r.team))];
  const [team, setTeam] = useState<string | null>(null);
  const visible = team ? roles.filter((r) => r.team === team) : roles;

  if (!roles.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
        <p className="text-2xl font-medium">{c.noRoles}</p>
        <p className="mx-auto mt-2 max-w-md text-fog-400">{c.noRolesBody}</p>
      </div>
    );
  }

  return (
    <div>
      {teams.length > 1 && (
        <div role="group" aria-label={c.filterLabel} className="glass no-scrollbar mb-10 inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5">
          {[null, ...teams].map((value) => {
            const active = team === value;
            const count = value ? roles.filter((r) => r.team === value).length : roles.length;
            return (
              <button
                key={value ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setTeam(value)}
                className={cn("relative flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors", active ? "text-ink-950" : "text-fog-200 hover:text-fog-50")}
              >
                {active && <motion.span layoutId="roles-filter" className="absolute inset-0 rounded-full bg-fog-50" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className="relative">{value ?? c.filterAll}</span>
                <span className={cn("relative font-mono text-2xs", active ? "text-ink-950/60" : "text-fog-500")}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <motion.ul layout className="border-t border-line">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((r, i) => (
            <motion.li
              key={r.slug}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.6, ease: ease.outExpo, delay: Math.min(i, 6) * 0.05 }}
              className="border-b border-line"
            >
              <Link href={`/careers/${r.slug}`} className="group relative grid gap-4 py-7 outline-offset-[-2px] md:grid-cols-12 md:items-center md:gap-6 md:py-9">
                <span aria-hidden="true" className="absolute inset-0 -z-10 origin-left scale-x-0 bg-gradient-to-r from-flux/[0.08] via-flux/[0.03] to-transparent transition-transform duration-700 ease-(--ease-out-expo) group-hover:scale-x-100" />
                <span className="font-mono text-xs text-fog-500 transition-colors group-hover:text-flux md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
                <span className="md:col-span-6">
                  <span className="block text-[clamp(1.4rem,2.6vw,2.2rem)] font-medium leading-tight tracking-[-0.035em] text-fog-50 transition-transform duration-700 ease-(--ease-out-expo) md:group-hover:translate-x-3">
                    {r.title}
                  </span>
                  <span className="mt-2 block max-w-xl text-sm leading-relaxed text-fog-400 md:max-h-0 md:overflow-hidden md:opacity-0 md:transition-all md:duration-700 md:group-hover:max-h-24 md:group-hover:opacity-100 md:group-focus-visible:max-h-24 md:group-focus-visible:opacity-100">
                    {r.summary}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 md:col-span-4">
                  <span className="rounded-full border border-line px-3 py-1 text-xs text-fog-200">{r.team}</span>
                  <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-fog-200">
                    <MapPin size={12} /> {t.options.workModes[r.workMode]}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-flux/30 bg-flux/[0.08] px-3 py-1 text-xs text-flux-soft">
                    <Clock size={12} /> {t.options.employmentTypes[r.employmentType]}
                  </span>
                </span>
                <span className="hidden justify-end md:col-span-1 md:flex">
                  <span className="flex size-11 items-center justify-center rounded-full border border-line-strong transition-all duration-500 ease-(--ease-out-expo) group-hover:rotate-45 group-hover:border-flux group-hover:bg-flux group-hover:text-ink-950">
                    <ArrowUpRight size={18} />
                  </span>
                </span>
                <span className="sr-only">{fmt(c.roleMeta, { team: r.team, location: r.location })}</span>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
