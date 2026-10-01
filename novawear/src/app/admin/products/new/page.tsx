import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { AdminHeader } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { ArrowLeft } from "@/components/ui/icons";

export const metadata = { title: "Add a product" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/admin/products" className="label mb-4 inline-flex min-h-11 items-center gap-2 text-xs hover:text-leopard-ink">
        <ArrowLeft size={16} /> Products
      </Link>
      <AdminHeader title="Add a product">Fill in the details, then add photos on the next screen.</AdminHeader>
      <ProductForm />
    </>
  );
}
