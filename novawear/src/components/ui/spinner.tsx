import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-[1.5px] border-current border-r-transparent",
        className,
      )}
    />
  );
}
