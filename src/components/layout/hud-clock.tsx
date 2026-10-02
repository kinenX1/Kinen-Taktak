"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Small status readout next to the logo: a live dot and the visitor's local time. */
export function HudClock({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span aria-hidden="true" className={cn("items-center gap-2 font-mono text-2xs uppercase tracking-[0.14em] text-fog-500", className)}>
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
        <span className="relative size-1.5 rounded-full bg-success" />
      </span>
      {t.nav.status}
      <span className="h-3 w-px bg-line-strong" />
      <span className="tabular-nums text-fog-400">
        {now ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(now) : "--:--"}
      </span>
    </span>
  );
}
