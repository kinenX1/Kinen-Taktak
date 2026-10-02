"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/actions/locale";
import { fmt, locales } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** EN / FR toggle. The indicator glides between the two codes. */
export function LanguageSwitch({ className, id = "lang" }: { className?: string; id?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div
      role="group"
      aria-label={t.nav.language}
      className={cn("relative flex h-9 items-center rounded-full border border-line p-1 font-mono text-2xs uppercase tracking-[0.12em]", pending && "opacity-60", className)}
    >
      {locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            aria-label={fmt(t.nav.switchTo, { language: t.language[l] })}
            disabled={pending}
            onClick={() => {
              if (active) return;
              start(async () => {
                await setLocaleAction(l);
                router.refresh();
              });
            }}
            className={cn("relative z-10 h-7 rounded-full px-2.5 transition-colors duration-300", active ? "text-ink-950" : "text-fog-400 hover:text-fog-50")}
          >
            {active && (
              <motion.span
                layoutId={`${id}-indicator`}
                className="absolute inset-0 -z-10 rounded-full bg-fog-50 shadow-[0_0_18px_-4px_rgb(244_242_236/0.6)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {l}
          </button>
        );
      })}
    </div>
  );
}
