import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { formatPrice, orderStatusInfo, orderStatusValues } from "@/config/shop";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminOrders } from "@/lib/data/admin";
import { cn, formatDate } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/admin-shell";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { Search } from "@/components/ui/icons";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = orderStatusValues.find((s) => s === sp.status) as OrderStatus | undefined;
  const preorder = sp.type === "pre-order";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const orders = await getAdminOrders({ status, preorder, q: q || undefined });

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("label inline-flex h-10 items-center whitespace-nowrap rounded-full border-2 border-ink px-3.5 text-2xs", active ? "bg-ink text-bone" : "hover:bg-ink hover:text-bone")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <AdminHeader eyebrow={`${orders.length} shown`} title="Orders">
        Orders and pre-orders from customers. Open one to confirm it, ship it and keep the customer posted.
      </AdminHeader>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filter orders" className="flex flex-wrap gap-2">
          {chip("All", "/admin/orders", !status && !preorder)}
          {chip("Pre-orders", "/admin/orders?type=pre-order", preorder)}
          {orderStatusValues.map((s) => chip(orderStatusInfo[s].label, `/admin/orders?status=${s}`, status === s))}
        </nav>
        <form role="search" className="flex items-center gap-2 border-b-2 border-ink pb-1">
          <label htmlFor="order-q" className="sr-only">
            Search orders
          </label>
          <Search size={18} />
          <input id="order-q" name="q" type="search" defaultValue={q} placeholder="Reference, name, phone…" className="h-10 w-56 bg-transparent text-[0.9375rem] focus:outline-none" />
        </form>
      </div>
      {orders.length === 0 ? (
        <p className="bg-paper px-5 py-10 text-body">No orders match.</p>
      ) : (
        <div className="overflow-x-auto bg-paper">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left font-mono text-2xs uppercase tracking-[0.1em] text-muted">
                <th scope="col" className="px-5 py-3 font-medium">Order</th>
                <th scope="col" className="px-3 py-3 font-medium">Customer</th>
                <th scope="col" className="px-3 py-3 font-medium">Items</th>
                <th scope="col" className="px-3 py-3 font-medium">Type</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-bone">
                  <td className="px-5 py-3">
                    <Link href={`/admin/orders/${o.reference}`} className="font-mono font-bold underline-offset-4 hover:underline">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-semibold">{o.fullName}</span>
                    <span className="block text-xs text-muted">{o.city}</span>
                  </td>
                  <td className="px-3 py-3">{o._count.items}</td>
                  <td className="px-3 py-3">{o.hasPreorder ? <Badge tone="ink">Pre-order</Badge> : <Badge tone="outline">Order</Badge>}</td>
                  <td className="px-3 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{formatPrice(o.total)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-muted">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
