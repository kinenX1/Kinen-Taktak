import Link from "next/link";
import { formatPrice } from "@/config/shop";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminStats, getRecentOrders } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/admin-shell";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export default async function AdminOverview() {
  const admin = await requireAdmin();
  const [stats, recent] = await Promise.all([getAdminStats(), getRecentOrders()]);
  const tiles = [
    { label: "Products", value: stats.products, note: `${stats.published} live in the shop`, href: "/admin/products" },
    { label: "Open orders", value: stats.openOrders, note: "Received, confirmed or shipped", href: "/admin/orders" },
    { label: "Open pre-orders", value: stats.openPreorders, note: "Waiting to be confirmed or made", href: "/admin/orders?type=pre-order", dark: true },
    { label: "Customers", value: stats.customers, note: `${stats.subscribers} newsletter sign-ups`, href: "/admin/customers" },
  ];

  return (
    <>
      <AdminHeader
        eyebrow={`Hey ${admin.name.split(" ")[0]}`}
        title="Overview"
        actions={
          <ButtonLink href="/admin/products/new" arrow>
            Add a product
          </ButtonLink>
        }
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className={`group block h-full p-5 transition-transform hover:-translate-y-1 ${t.dark ? "bg-ink text-bone" : "bg-paper"}`}>
              <p className={`font-mono text-2xs uppercase tracking-[0.12em] ${t.dark ? "text-leopard" : "text-muted"}`}>{t.label}</p>
              <p className="display mt-2 text-[3.5rem] leading-none">{t.value}</p>
              <p className={`mt-2 text-sm ${t.dark ? "text-fog" : "text-body"}`}>{t.note}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="recent-title" className="mt-10 bg-paper">
        <div className="flex items-center justify-between border-b-[1.5px] border-ink px-5 py-4">
          <h2 id="recent-title" className="display text-3xl">
            Latest orders
          </h2>
          <Link href="/admin/orders" className="label text-xs underline-offset-4 hover:underline">
            All orders
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-body">No orders yet. They&apos;ll show up here the moment a customer checks out.</p>
        ) : (
          <ul>
            {recent.map((o) => (
              <li key={o.id} className="border-t border-line first:border-t-0">
                <Link href={`/admin/orders/${o.reference}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-bone">
                  <span className="font-mono text-sm font-bold">{o.reference}</span>
                  <span className="min-w-32 flex-1 font-semibold">{o.fullName}</span>
                  {o.hasPreorder && <Badge tone="ink">Pre-order</Badge>}
                  <OrderStatusBadge status={o.status} />
                  <span className="w-24 text-right font-semibold">{formatPrice(o.total)}</span>
                  <span className="w-28 text-right font-mono text-xs text-muted">{formatDate(o.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
