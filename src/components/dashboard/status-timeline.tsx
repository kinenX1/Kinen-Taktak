import type { RequestStatus } from "@prisma/client";
import { requestStatuses, statusFlow } from "@/config/project-brief";
import { cn } from "@/lib/utils";
import { Check } from "@/components/ui/icons";

/** Horizontal lifecycle tracker (vertical on small screens). */
export function StatusTimeline({ status }: { status: RequestStatus }) {
  if (status === "DRAFT" || status === "CANCELLED") {
    const s = requestStatuses.find((x) => x.value === status)!;
    return (
      <div className="rounded-md border border-line bg-ink-900/60 px-5 py-4 text-sm text-fog-400">
        <span className="font-medium text-fog-50">{s.label}.</span> {s.description}
      </div>
    );
  }
  const currentIndex = statusFlow.indexOf(status);
  return (
    <ol className="grid gap-3 sm:grid-cols-6 sm:gap-0" aria-label="Project progress">
      {statusFlow.map((value, i) => {
        const meta = requestStatuses.find((s) => s.value === value)!;
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={value} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-3" aria-current={current ? "step" : undefined}>
            <div className="flex items-center sm:w-full">
              <span
                className={cn(
                  "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-2xs transition-colors",
                  done && "border-flux bg-flux text-ink-950",
                  current && "border-flux bg-ink-950 text-flux shadow-[var(--glow-flux)]",
                  !done && !current && "border-line-strong bg-ink-950 text-fog-500",
                )}
              >
                {done ? <Check size={13} strokeWidth={2.4} /> : current ? <span className="size-2 animate-pulse rounded-full bg-flux" /> : i + 1}
              </span>
              {i < statusFlow.length - 1 && (
                <span aria-hidden="true" className={cn("hidden h-px flex-1 sm:block", i < currentIndex ? "bg-flux" : "bg-line-strong")} />
              )}
            </div>
            <div className="sm:pr-3">
              <p className={cn("text-sm font-medium", current || done ? "text-fog-50" : "text-fog-500")}>{meta.label}</p>
              {current && <p className="mt-0.5 text-xs leading-snug text-fog-400">{meta.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
