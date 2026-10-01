"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { deliveryFee, formatPrice } from "@/config/shop";
import { ease } from "@/lib/motion";
import { Leopard } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { Clock, Minus, Plus } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { removeFromBag, setQuantity, useBag } from "./cart-store";
import { LineThumb } from "./line-thumb";

export function BagView() {
  const { lines, count, subtotal, hasPreorder } = useBag();

  return (
    <div className="container-x pb-24 pt-10">
      <h1 className="display mb-8 text-[clamp(4rem,9vw,8.25rem)] leading-[0.82]">
        Your bag <span className="align-top font-mono text-lg font-medium tracking-[0.06em] [font-stretch:100%]">({count})</span>
      </h1>

      {lines.length === 0 ? (
        <div className="border-t-2 border-ink py-16">
          <p className="text-xl">Your bag is empty.</p>
          <p className="mt-2 text-body">The leopard is waiting. Pick something from the drop.</p>
          <ButtonLink href="/shop" size="lg" arrow className="mt-7">
            Shop the drop
          </ButtonLink>
          <div aria-hidden="true" className="relative mt-16 h-20 overflow-hidden border-b-2 border-ink">
            <div className="absolute bottom-0.5 left-0 w-36 animate-run [--run-duration:6s]">
              <div className="animate-gallop">
                <Leopard />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-8">
          <div className="min-w-0 flex-[1_1_560px]">
            {hasPreorder && (
              <div className="mb-4 flex items-start gap-3.5 bg-ink px-4 py-4 text-bone">
                <Clock size={22} className="mt-0.5 shrink-0 text-leopard" />
                <p className="text-[0.9375rem] leading-relaxed">
                  Your bag has pre-order pieces. In-stock items ship now; pre-orders are reserved in your size and ship when the drop lands.
                </p>
              </div>
            )}
            <ul>
              <AnimatePresence initial={false}>
                {lines.map((line) => (
                  <motion.li
                    key={line.key}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40, height: 0, paddingTop: 0, paddingBottom: 0 }}
                    transition={{ duration: 0.5, ease: ease.outExpo }}
                    className="flex gap-4 overflow-hidden border-t border-line-strong py-4"
                  >
                    <Link href={`/shop/${line.slug}`} aria-label={line.name} className="w-[clamp(92px,14vw,136px)]">
                      <LineThumb category={line.category} colorHex={line.colorHex} imageId={line.imageId} />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-extrabold leading-snug">
                            <Link href={`/shop/${line.slug}`} className="hover:text-leopard-ink">
                              {line.name}
                            </Link>
                          </h2>
                          <p className="mt-1 font-mono text-xs tracking-[0.06em] text-muted">
                            {line.colorName} · Size {line.size}
                          </p>
                        </div>
                        <p className="whitespace-nowrap text-lg font-extrabold [font-stretch:80%]">{formatPrice(line.price * line.quantity)}</p>
                      </div>
                      <Badge tone={line.preorder ? "ink" : "paper"} className="self-start">
                        {line.preorder ? "Pre-order" : "In stock"}
                      </Badge>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                        <div className="flex h-11 items-center border-[1.5px] border-line-strong">
                          <button type="button" onClick={() => setQuantity(line.key, line.quantity - 1)} disabled={line.quantity <= 1} aria-label={`Decrease quantity of ${line.name}`} className="flex h-full w-11 items-center justify-center hover:bg-ink/5 disabled:opacity-40">
                            <Minus size={15} />
                          </button>
                          <span className="min-w-6 text-center font-mono font-bold">{line.quantity}</span>
                          <button type="button" onClick={() => setQuantity(line.key, line.quantity + 1)} aria-label={`Increase quantity of ${line.name}`} className="flex h-full w-11 items-center justify-center hover:bg-ink/5">
                            <Plus size={15} />
                          </button>
                        </div>
                        <button type="button" onClick={() => removeFromBag(line.key)} className="min-h-11 text-sm font-semibold underline underline-offset-4 hover:text-danger">
                          Remove
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>

          <aside aria-labelledby="summary-title" className="w-full max-w-[420px] flex-[1_1_320px] bg-paper p-7 lg:sticky lg:top-24">
            <h2 id="summary-title" className="display text-[2.5rem]">
              Summary
            </h2>
            <dl className="mt-5 grid gap-3 text-[0.9375rem]">
              <div className="flex justify-between">
                <dt>
                  Subtotal ({count} item{count === 1 ? "" : "s"})
                </dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Delivery</dt>
                <dd className="text-right">{deliveryFee === null ? "Confirmed by phone" : deliveryFee === 0 ? "Free" : formatPrice(deliveryFee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Payment</dt>
                <dd>On delivery</dd>
              </div>
            </dl>
            <div className="my-5 h-[1.5px] bg-ink" />
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-extrabold">Total</span>
              <span className="text-[1.75rem] font-black [font-stretch:80%]">{formatPrice(subtotal + (deliveryFee ?? 0))}</span>
            </div>
            <ButtonLink href="/checkout" size="lg" arrow className="mt-6 w-full">
              Checkout
            </ButtonLink>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              You&apos;ll sign in or create an account at checkout so you can track your order.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
