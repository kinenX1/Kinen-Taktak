"use client";

import { useT } from "@/i18n/client";

export function OptionalTag() {
  const t = useT();
  return <span className="font-mono text-2xs uppercase tracking-[0.12em] text-fog-500">{t.common.optional}</span>;
}
