"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { ease } from "@/lib/motion";

type RevealProps = HTMLMotionProps<"div"> & {
  delay?: number;
  /** Distance in px the element travels while revealing. */
  y?: number;
  as?: "div" | "section" | "li" | "article" | "header" | "p";
};

/** Fades and lifts content into place the first time it enters the viewport. */
export function Reveal({ delay = 0, y = 28, as = "div", children, ...props }: RevealProps) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 1, ease: ease.outExpo, delay }}
      {...props}
    >
      {children}
    </Component>
  );
}
