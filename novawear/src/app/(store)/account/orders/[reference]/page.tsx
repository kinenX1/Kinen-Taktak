import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice, orderStatusInfo } from "@/config/shop";
import { requireUser } from "@/lib/auth/dal";
import { getMyOrder } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/utils";
import { ClearBagOnMount } from "@/components/cart/clear-bag";
import { LineThumb } from "@/components/cart/line-thumb";
import { OrderPlaced } from "@/components/account/order-placed";
import { OrderProgress } from "@/components/account/order-timeline";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { ArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: PageProps<"/account/orders/[reference]">) {
  const { reference } = await params;
  const user = await requireUser(`/account/orders/${reference}`);
  const order = await getMyOrder(user.id, reference);
  if (!order) notFound();
  const placed = (await searchParams).placed === "1";

  return (
    <div className="container-x pb-24 pt-8">
      {placed && (
        <>
          <ClearBagOnMount />
          <OrderPlaced reference={order.reference} preorder={order.hasPreorder} />
        </>
      )}
      <Link href="/account" className="label mb-6 inline-flex min-h-11 items-center gap-2 text-xs hover:text-leopard-ink">
        <ArrowLeft size={16} /> All orders
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-6">
        <div>
          <p className="eyebrow mb-2">Placed {formatDateTime(order.createdAt)}</p>
          <h1 className="display text-[clamp(3.5rem,8vw,6.5rem)]">{order.reference}</h1>
        </div>
        <div className="flex gap-2">
          <OrderStatusBadge status={order.status} />
          {order.hasPreorder && <Badge tone="ink">Includes pre-order</Badge>}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="progress-title" className="bg-paper p-6">
            <h2 id="progress-title" className="label mb-1 text-[0.9375rem]">
              {orderStatusInfo[order.status].label}
            </h2>
            <p className="mb-5 text-[0.9375rem] text-body">{orderStatusInfo[order.status].description}</p>
            <OrderProgress status={order.status} />
            <ol className="mt-6 space-y-4 border-l-2 border-ink pl-5">
              {[...order.events].reverse().map((ev) => (
                <li key={ev.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-ink bg-ground" />
                  <p className="font-bold">{orderStatusInfo[ev.status].label}</p>
                  <p className="font-mono text-xs text-muted">{formatDateTime(ev.createdAt)}</p>
                  {ev.note && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-body">{ev.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="items-title">
            <h2 id="items-title" className="label mb-3 text-[0.9375rem]">
              Items
            </h2>
            <ul>
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-4 border-t border-line-strong py-4">
                  <LineThumb category={it.category} colorHex={it.colorHex} className="w-20" />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{it.productId ? <Link href={`/shop/${it.slug}`}>{it.name}</Link> : it.name}</p>
                    <p className="font-mono text-xs text-muted">
                      {it.colorName} · Size {it.size} × {it.quantity}
                    </p>
                    {it.preorder && (
                      <Badge tone="ink" className="mt-2">
                        Pre-order
                      </Badge>
                    )}
                  </div>
                  <p className="font-extrabold [font-stretch:80%]">{formatPrice(it.unitPrice * it.quantity)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-labelledby="total-title" className="bg-ink p-6 text-bone">
            <h2 id="total-title" className="label text-[0.9375rem] text-leopard">
              Total
            </h2>
            <dl className="mt-3 grid gap-2 text-sm text-fog">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{order.deliveryFee === null ? "Confirmed by phone" : formatPrice(order.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Payment</dt>
                <dd>Cash on delivery</dd>
              </div>
            </dl>
            <p className="mt-4 text-3xl font-black [font-stretch:80%]">{formatPrice(order.total)}</p>
          </section>
          <section aria-labelledby="ship-title" className="bg-paper p-6 text-[0.9375rem] leading-relaxed">
            <h2 id="ship-title" className="label mb-2 text-[0.9375rem]">
              Delivery to
            </h2>
            <p className="font-bold">{order.fullName}</p>
            <p>{order.address}</p>
            <p>
              {order.city}
              {order.postalCode ? ` ${order.postalCode}` : ""}
            </p>
            <p className="mt-2 font-mono text-xs text-muted">
              {order.phone} · {order.email}
            </p>
            {order.note && <p className="mt-3 border-t border-line pt-3 text-body">“{order.note}”</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
