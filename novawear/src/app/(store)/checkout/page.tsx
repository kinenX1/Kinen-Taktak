import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getLastDelivery } from "@/lib/data/orders";
import { CheckoutForm } from "@/components/cart/checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const last = await getLastDelivery(user.id);
  return (
    <CheckoutForm
      defaults={{
        fullName: last?.fullName ?? user.name,
        email: user.email,
        phone: last?.phone ?? user.phone ?? "",
        address: last?.address ?? "",
        city: last?.city ?? "",
        postalCode: last?.postalCode ?? "",
      }}
    />
  );
}
