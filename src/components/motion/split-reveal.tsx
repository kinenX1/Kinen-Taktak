"use client";

import { motion } from "motion/react";
import { Fragment, type ReactNode } from "react";
import { ease } from "@/lib/motion";

export type SplitLine = { text: string; className?: string } | ReactNode;

type Props = {
  /** Each entry is rendered on its own line; strings are split into words. */
  lines: SplitLine[];
  className?: string;
  delay?: number;
  stagger?: number;
  /** Animate on mount (hero) instead of when scrolled into view. */
  immediate?: boolean;
};

function isTextLine(line: SplitLine): line is { text: string; className?: string } {
  return typeof line === "object" && line !== null && "text" in line;
}

/**
 * Display typography that rises word-by-word from behind a mask.
 * Screen readers get the full sentence once via the visually hidden copy.
 */
export function SplitReveal({ lines, className, delay = 0, stagger = 0.06, immediate }: Props) {
  let index = 0;
  const label = lines
    .map((l) => (typeof l === "string" ? l : isTextLine(l) ? l.text : ""))
    .join(" ")
    .trim();

  const trigger = immediate
    ? { animate: "shown" as const }
    : { whileInView: "shown" as const, viewport: { once: true, margin: "0px 0px -10% 0px" } };

  return (
    <motion.span className={className} initial="hidden" {...trigger}>
      {label && <span className="sr-only">{label}</span>}
      <span aria-hidden={label ? true : undefined}>
        {lines.map((line, li) => {
          const words = typeof line === "string" ? line.split(" ") : isTextLine(line) ? line.text.split(" ") : null;
          const lineClass = isTextLine(line) ? line.className : undefined;
          return (
            <span key={li} className="block">
              {words
                ? words.map((word, wi) => {
                    const i = index++;
                    return (
                      <Fragment key={wi}>
                        <span className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-top">
                          <motion.span
                            className={`inline-block will-change-transform ${lineClass ?? ""}`}
                            variants={{
                              hidden: { y: "108%", rotate: 4 },
                              shown: {
                                y: "0%",
                                rotate: 0,
                                transition: { duration: 1.15, ease: ease.outExpo, delay: delay + i * stagger },
                              },
                            }}
                          >
                            {word}
                          </motion.span>
                        </span>
                        {wi < words.length - 1 && " "}
                      </Fragment>
                    );
                  })
                : (() => {
                    const i = index++;
                    return (
                      <span className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-top">
                        <motion.span
                          className="inline-block"
                          variants={{
                            hidden: { y: "108%" },
                            shown: {
                              y: "0%",
                              transition: { duration: 1.15, ease: ease.outExpo, delay: delay + i * stagger },
                            },
                          }}
                        >
                          {line as ReactNode}
                        </motion.span>
                      </span>
                    );
                  })()}
            </span>
          );
        })}
      </span>
    </motion.span>
  );
}
