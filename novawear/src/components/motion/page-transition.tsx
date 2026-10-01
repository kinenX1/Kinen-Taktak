"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

/**
 * Cross-route page transition using the browser View Transitions API.
 * Keyed by pathname so each route enters/exits as a whole; named shared
 * elements (e.g. project covers) morph between pages. Browsers without
 * support simply navigate instantly.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page" exit="page" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
