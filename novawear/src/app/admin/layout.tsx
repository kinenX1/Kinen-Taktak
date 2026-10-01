import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { getPendingOrderCount } from "@/lib/data/admin";
import { AdminShell, type AdminNavItem } from "@/components/admin/admin-shell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — NovaWear Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const pending = await getPendingOrderCount();
  const nav: AdminNavItem[] = [
    { label: "Overview", href: "/admin", icon: "Grid", exact: true },
    { label: "Products", href: "/admin/products", icon: "Tag" },
    { label: "Orders", href: "/admin/orders", icon: "Box", badge: pending },
    { label: "Customers", href: "/admin/customers", icon: "Users" },
  ];
  return (
    <AdminShell nav={nav} user={admin}>
      {children}
    </AdminShell>
  );
}
