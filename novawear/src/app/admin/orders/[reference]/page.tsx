import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice, orderStatusInfo } from "@/config/shop";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminOrder } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/admin-shell";
import { OrderStatusForm } from "@/components/admin/order-status-form";
import { LineThumb } from "@/components/cart/line-thumb";
import { OrderProgress } from "@/components/account/order-timeline";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { ArrowLeft } from "@/components/ui/icons";

export const metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[reference]">) {
  await requireAdmin();
  const { reference } = await params;
  const order = await getAdminOrder(reference);
  if (!order) notFound();
  const tel = order.phone.replace(/[^\d+]/g, "");

  return (
    <>
      <Link href="/admin/orders" className="label mb-4 inline-flex min-h-11 items-center gap-2 text-xs hover:text-leopard-ink">
        <ArrowLeft size={16} /> Orders
      </Link>
      <AdminHeader eyebrow={`Placed ${formatDateTime(order.createdAt)}`} title={order.reference} actions={<OrderStatusBadge status={order.status} />} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section aria-labelledby="items-title" className="bg-paper p-5">
            <div className="mb-3 flex items-center gap-3">
              <h2 id="items-title" className="label text-[0.9375rem]">
                Items
              </h2>
              {order.hasPreorder && <Badge tone="ink">Includes pre-order</Badge>}
            </div>
            <ul>
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-4 border-t border-line py-3">
                  <LineThumb category={it.category} colorHex={it.colorHex} className="w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{it.name}</p>
                    <p className="font-mono text-xs text-muted">
                      {it.colorName} · Size {it.size} × {it.quantity} · {formatPrice(it.unitPrice)} each
                    </p>
                  </div>
                  {it.preorder && <Badge tone="ink">Pre-order</Badge>}
                  <p className="w-24 text-right font-bold">{formatPrice(it.unitPrice * it.quantity)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid gap-1.5 border-t-[1.5px] border-ink pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{order.deliveryFee === null ? "To confirm with the customer" : formatPrice(order.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between text-lg font-extrabold">
                <dt>Total (cash on delivery)</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="history-title" className="bg-paper p-5">
            <h2 id="history-title" className="label mb-4 text-[0.9375rem]">
              Progress
            </h2>
            <OrderProgress status={order.status} />
            <ol className="mt-6 space-y-4 border-l-2 border-ink pl-5">
              {[...order.events].reverse().map((ev) => (
                <li key={ev.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-ink bg-paper" />
                  <p className="font-bold">{orderStatusInfo[ev.status].label}</p>
                  <p className="font-mono text-xs text-muted">{formatDateTime(ev.createdAt)}</p>
                  {ev.note && <p className="mt-1 text-sm text-body">{ev.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <OrderStatusForm orderId={order.id} status={order.status} />
          <section aria-labelledby="customer-title" className="bg-paper p-5 text-[0.9375rem] leading-relaxed">
            <h2 id="customer-title" className="label mb-2 text-[0.9375rem]">
              Customer &amp; delivery
            </h2>
            <p className="font-bold">{order.fullName}</p>
            <p>{order.address}</p>
            <p>
              {order.city}
              {order.postalCode ? ` ${order.postalCode}` : ""}
            </p>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <a href={`tel:${tel}`} className="font-semibold underline underline-offset-4">
                {order.phone}
              </a>
              <a href={`mailto:${order.email}`} className="break-all font-semibold underline underline-offset-4">
                {order.email}
              </a>
            </p>
            {order.note && <p className="mt-3 border-t border-line pt-3 text-body">Note: “{order.note}”</p>}
            <p className="mt-3 border-t border-line pt-3 font-mono text-xs text-muted">Account: {order.user.name} · {order.user.email}</p>
          </section>
        </aside>
      </div>
    </>
  );
}
