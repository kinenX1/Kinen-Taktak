import type { Availability, OrderStatus } from "@prisma/client";
import { availabilityLabel, orderStatusInfo } from "@/config/shop";
import { cn } from "@/lib/utils";

const tones = {
  ink: "bg-ink text-bone",
  paper: "bg-paper text-ink",
  outline: "border-[1.5px] border-ink/40 text-ink",
  leopard: "bg-leopard text-ink",
  success: "bg-success text-bone",
  danger: "bg-danger text-bone",
} as const;

export function Badge({
  tone = "outline",
  className,
  children,
  dot,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2.5 font-mono text-2xs font-bold uppercase tracking-[0.12em]",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function AvailabilityBadge({ availability, className }: { availability: Availability; className?: string }) {
  const tone = availability === "PRE_ORDER" ? "ink" : availability === "SOLD_OUT" ? "danger" : "paper";
  return (
    <Badge tone={tone} className={className}>
      {availabilityLabel[availability]}
    </Badge>
  );
}

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const tone =
    status === "DELIVERED" ? "success" : status === "CANCELLED" ? "danger" : status === "PENDING" ? "leopard" : "ink";
  return (
    <Badge tone={tone} dot className={className}>
      {orderStatusInfo[status].label}
    </Badge>
  );
}
