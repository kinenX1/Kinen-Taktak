import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { formatPrice } from "@/config/shop";
import { requireUser } from "@/lib/auth/dal";
import { getMyOrders } from "@/lib/data/orders";
import { formatDate } from "@/lib/utils";
import { OrderProgress } from "@/components/account/order-timeline";
import { Reveal } from "@/components/motion/reveal";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { ArrowUpRight } from "@/components/ui/icons";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const orders = await getMyOrders(user.id);

  return (
    <div className="container-x pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-8">
        <div>
          <p className="eyebrow mb-3">
            Signed in as {user.name} · {user.email}
          </p>
          <h1 className="display text-[clamp(4rem,9vw,8.25rem)] leading-[0.82]">My orders</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role === "ADMIN" && (
            <ButtonLink href="/admin" variant="leopard">
              Admin panel
            </ButtonLink>
          )}
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {sp.denied === "admin" && <FormMessage>That area is for NovaWear administrators only.</FormMessage>}
        {sp.reset === "1" && <FormMessage tone="success">Your password was changed. You&apos;re signed in.</FormMessage>}
      </div>

      {orders.length === 0 ? (
        <div className="py-14">
          <p className="text-xl">No orders yet.</p>
          <p className="mt-2 text-body">When you order or pre-order, you can follow it here.</p>
          <ButtonLink href="/shop" size="lg" arrow className="mt-7">
            Shop the drop
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {orders.map((o, i) => (
            <Reveal as="li" key={o.id} delay={Math.min(i, 5) * 0.06}>
              <Link href={`/account/orders/${o.reference}`} className="group block bg-paper p-6 transition-colors hover:bg-bone">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="font-mono text-base font-bold">{o.reference}</h2>
                    <OrderStatusBadge status={o.status} />
                    {o.hasPreorder && <Badge tone="ink">Pre-order</Badge>}
                  </div>
                  <span className="flex items-center gap-3 font-mono text-xs text-muted">
                    {formatDate(o.createdAt)}
                    <ArrowUpRight size={18} className="text-ink transition-transform group-hover:rotate-45" />
                  </span>
                </div>
                <p className="mt-3 text-[0.9375rem] leading-relaxed">
                  {o.items.map((it) => `${it.name} — ${it.colorName}, ${it.size} × ${it.quantity}`).join(" · ")}
                </p>
                <p className="mt-1 font-mono text-xs text-muted">Total {formatPrice(o.total)}</p>
                <div className="mt-5">
                  <OrderProgress status={o.status} />
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
