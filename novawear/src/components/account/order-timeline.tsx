import type { OrderStatus } from "@prisma/client";
import { orderFlow, orderStatusInfo } from "@/config/shop";
import { cn } from "@/lib/utils";

/** Received → Confirmed → Shipped → Delivered, with the bar filling up. */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "CANCELLED") {
    return <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-danger">This order was cancelled</p>;
  }
  const at = orderFlow.indexOf(status);
  return (
    <div>
      <div className="relative h-1 bg-ground-2" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={at + 1} aria-valuetext={orderStatusInfo[status].label}>
        <div className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-1000 ease-(--ease-out-expo)" style={{ width: `${((at + 1) / orderFlow.length) * 100}%` }} />
      </div>
      <ol className="mt-2.5 grid grid-cols-4 font-mono text-2xs uppercase tracking-[0.06em]">
        {orderFlow.map((s, i) => (
          <li key={s} className={cn(i <= at ? "text-ink" : "text-stone", i === at && "font-bold")}>
            {orderStatusInfo[s].label}
          </li>
        ))}
      </ol>
    </div>
  );
}
