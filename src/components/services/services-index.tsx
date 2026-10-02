"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Sticky in-page navigation that tracks which service is on screen. */
export function ServicesIndex({ items, label }: { items: { slug: string; label: string }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.slug);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    items.forEach((i) => {
      const el = document.getElementById(i.slug);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  // Keep the active pill visible in the horizontal scroller.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-slug="${active}"]`);
    if (list && el) {
      list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav aria-label={label} className="sticky top-3 z-30 md:top-4">
      <div className="container-x">
        <ul ref={listRef} className="glass no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5 shadow-[var(--shadow-float)] lg:inline-flex">
          {items.map((item) => (
            <li key={item.slug} data-slug={item.slug} className="shrink-0">
              <a
                href={`#${item.slug}`}
                aria-current={active === item.slug ? "true" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-full px-4 text-sm transition-colors duration-300",
                  active === item.slug ? "bg-fog-50 text-ink-950" : "text-fog-200 hover:text-fog-50",
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
