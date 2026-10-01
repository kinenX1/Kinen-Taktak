"use client";

import Link from "next/link";
import { useActionState } from "react";
import { placeOrderAction } from "@/actions/order";
import { deliveryFee, formatPrice } from "@/config/shop";
import { initialFormState } from "@/lib/validation/common";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { useBag } from "./cart-store";
import { LineThumb } from "./line-thumb";

type Defaults = { fullName: string; email: string; phone: string; address: string; city: string; postalCode: string };

export function CheckoutForm({ defaults }: { defaults: Defaults }) {
  const { lines, count, subtotal, hasPreorder } = useBag();
  const [state, action, pending] = useActionState(placeOrderAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = { ...defaults, ...state.values };
  const items = JSON.stringify(lines.map((l) => ({ productId: l.productId, colorName: l.colorName, size: l.size, quantity: l.quantity })));

  if (lines.length === 0) {
    return (
      <div className="container-x pb-24 pt-10">
        <h1 className="display text-[clamp(4rem,9vw,8.25rem)]">Checkout</h1>
        <p className="mt-6 text-xl">Your bag is empty.</p>
        <ButtonLink href="/shop" size="lg" arrow className="mt-6">
          Shop the drop
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="container-x pb-24 pt-10">
      <input type="hidden" name="items" value={items} />
      <h1 className="display mb-8 text-[clamp(4rem,9vw,8.25rem)] leading-[0.82]">Delivery</h1>
      <div className="flex flex-wrap items-start gap-8">
        <div className="min-w-0 flex-[1_1_560px] space-y-5">
          {state.message && <FormMessage>{state.message}</FormMessage>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fullName" label="Full name" error={e.fullName}>
              {(a) => <Input {...a} name="fullName" autoComplete="name" required defaultValue={v.fullName} />}
            </Field>
            <Field id="phone" label="Phone" error={e.phone} hint="We call or message you to confirm the order.">
              {(a) => <Input {...a} name="phone" type="tel" autoComplete="tel" required defaultValue={v.phone} />}
            </Field>
            <Field id="email" label="Email" error={e.email} className="sm:col-span-2">
              {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={v.email} />}
            </Field>
            <Field id="address" label="Address" error={e.address} className="sm:col-span-2">
              {(a) => <Input {...a} name="address" autoComplete="street-address" required defaultValue={v.address} />}
            </Field>
            <Field id="city" label="City" error={e.city}>
              {(a) => <Input {...a} name="city" autoComplete="address-level2" required defaultValue={v.city} />}
            </Field>
            <Field id="postalCode" label="Postal code" error={e.postalCode} optional>
              {(a) => <Input {...a} name="postalCode" autoComplete="postal-code" defaultValue={v.postalCode} />}
            </Field>
            <Field id="note" label="Note for us" error={e.note} optional className="sm:col-span-2">
              {(a) => <Textarea {...a} name="note" rows={3} placeholder="Delivery instructions, best time to call…" defaultValue={state.values?.note} className="min-h-24" />}
            </Field>
          </div>
          <fieldset className="border-[1.5px] border-ink bg-paper p-5">
            <legend className="label px-1 text-[0.9375rem]">Payment</legend>
            <p className="flex items-center gap-3 font-bold">
              <span className="flex size-5 items-center justify-center rounded-full border-2 border-ink">
                <span className="size-2.5 rounded-full bg-ink" />
              </span>
              Cash on delivery
            </p>
            <p className="ml-8 mt-1 text-sm text-muted">Pay when your order arrives. Pre-orders are reserved now and paid on delivery too.</p>
          </fieldset>
          <Link href="/bag" className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold underline underline-offset-4">
            Back to bag
          </Link>
        </div>

        <aside aria-labelledby="order-title" className="w-full max-w-[440px] flex-[1_1_320px] bg-ink p-7 text-bone lg:sticky lg:top-24">
          <h2 id="order-title" className="display text-[2.5rem]">
            Your order
          </h2>
          <ul className="mt-4">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 border-b border-line-dark py-3 text-sm">
                <LineThumb category={l.category} colorHex={l.colorHex} imageId={l.imageId} className="w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.name}</span>
                  <span className="text-fog-2">
                    {l.colorName} · {l.size} × {l.quantity}
                    {l.preorder && <span className="ml-2 font-mono text-2xs uppercase tracking-[0.1em] text-leopard">Pre-order</span>}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold">{formatPrice(l.price * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid gap-2 text-sm text-fog">
            <div className="flex justify-between">
              <dt>
                Subtotal ({count} item{count === 1 ? "" : "s"})
              </dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Delivery</dt>
              <dd>{deliveryFee === null ? "Confirmed by phone" : deliveryFee === 0 ? "Free" : formatPrice(deliveryFee)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-lg font-extrabold">Total</span>
            <span className="text-[1.75rem] font-black [font-stretch:80%]">{formatPrice(subtotal + (deliveryFee ?? 0))}</span>
          </div>
          <Button type="submit" variant="leopard" size="lg" pending={pending} className="mt-6 w-full">
            {pending ? "Placing order" : hasPreorder ? "Place order & pre-order" : "Place order"}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-fog-2">Final prices are checked when you place the order.</p>
        </aside>
      </div>
    </form>
  );
}
