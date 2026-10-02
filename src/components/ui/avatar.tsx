import { cn, initials } from "@/lib/utils";

/**
 * Round profile picture with an initials fallback. `ring` adds the animated
 * conic halo used in the navigation.
 */
export function UserAvatar({
  name,
  src,
  size = 36,
  ring,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- small, already-sized avatar served from our own API
    <img src={src} alt="" width={size} height={size} className="size-full rounded-full object-cover" draggable={false} />
  ) : (
    <span
      className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-flux to-flux-deep font-semibold text-ink-950"
      style={{ fontSize: Math.max(10, size * 0.36) }}
    >
      {initials(name) || "?"}
    </span>
  );

  return (
    <span className={cn("relative inline-flex shrink-0 rounded-full", ring && "avatar-ring p-[2px]", className)} style={{ width: size, height: size }}>
      <span className={cn("block size-full overflow-hidden rounded-full", ring && "bg-ink-950 p-[2px]")}>{inner}</span>
    </span>
  );
}
