"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ease } from "@/lib/motion";
import { Check } from "@/components/ui/icons";
import { ADDED_EVENT, type CartLine } from "./cart-store";

/** Slides up a confirmation whenever something is added to the bag. */
export function BagToast() {
  const [line, setLine] = useState<CartLine | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onAdded = (e: Event) => {
      setLine((e as CustomEvent<CartLine>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setLine(null), 3200);
    };
    window.addEventListener(ADDED_EVENT, onAdded);
    return () => {
      window.removeEventListener(ADDED_EVENT, onAdded);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex justify-center px-4">
      <AnimatePresence>
        {line && (
          <motion.div
            key={line.key + line.quantity}
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.45, ease: ease.outExpo }}
            className="pointer-events-auto flex max-w-full items-center gap-3 bg-ink py-3 pl-3 pr-5 text-bone shadow-[0_18px_40px_rgba(0,0,0,0.25)]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-leopard text-ink">
              <Check size={16} strokeWidth={3} />
            </span>
            <span className="min-w-0 text-[0.9375rem] font-semibold">
              <span className="block truncate">
                {line.preorder ? "Pre-order added" : "Added to bag"}: {line.name}
              </span>
              <span className="block font-mono text-2xs uppercase tracking-[0.12em] text-fog">
                {line.colorName} · {line.size}
              </span>
            </span>
            <Link href="/bag" className="label ml-2 shrink-0 text-xs text-leopard underline-offset-4 hover:underline">
              View bag
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
