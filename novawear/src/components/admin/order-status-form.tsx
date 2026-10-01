"use client";

import { useActionState, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { updateOrderStatusAction } from "@/actions/admin";
import { orderStatusInfo, orderStatusValues } from "@/config/shop";
import { initialFormState } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";

export function OrderStatusForm({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [state, action, pending] = useActionState(updateOrderStatusAction, initialFormState);
  const [next, setNext] = useState<OrderStatus>(status);
  return (
    <form action={action} className="space-y-4 bg-ink p-5 text-bone" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <h2 className="label text-[0.9375rem] text-leopard">Update status</h2>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={cn("border-l-4 px-3 py-2 text-[0.9375rem]", state.ok ? "border-leopard text-leopard" : "border-[#ff8a7a] text-[#ff8a7a]")}>
          {state.message}
        </p>
      )}
      <fieldset>
        <legend className="sr-only">New status</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {orderStatusValues.map((s) => (
            <label key={s} className="cursor-pointer">
              <input type="radio" name="status" value={s} checked={next === s} onChange={() => setNext(s)} className="peer sr-only" />
              <span
                className={cn(
                  "label flex h-11 items-center justify-center border-2 text-xs transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bone",
                  next === s ? "border-leopard bg-leopard text-ink" : "border-line-dark hover:border-bone/60",
                )}
              >
                {orderStatusInfo[s].label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="[&_label]:text-fog [&_textarea]:border-line-dark [&_textarea]:bg-ink-3 [&_textarea]:text-bone">
        <Field id="note" label="Message to the customer" optional error={state.fieldErrors?.note}>
          {(a) => <Textarea {...a} name="note" rows={3} placeholder="e.g. Your pre-order ships Friday." className="min-h-24" />}
        </Field>
      </div>
      <div className="[&_label]:text-fog">
        <Checkbox name="notify" defaultChecked label="Email the customer about this update" />
      </div>
      <Button type="submit" variant="leopard" className="w-full" pending={pending}>
        {pending ? "Saving" : "Save status"}
      </Button>
    </form>
  );
}
