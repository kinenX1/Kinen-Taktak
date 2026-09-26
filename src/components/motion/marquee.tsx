import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Infinite CSS marquee. Content is duplicated once for a seamless loop. */
export function Marquee({
  children,
  duration = 40,
  reverse,
  className,
}: {
  children: ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("group flex overflow-hidden", className)} aria-hidden="true">
      <div
        className="flex w-max shrink-0 animate-marquee group-hover:[animation-play-state:paused]"
        style={{
          ["--marquee-duration" as string]: `${duration}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center">{children}</div>
      </div>
    </div>
  );
}
