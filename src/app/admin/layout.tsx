import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { AppShell, type ShellNavItem } from "@/components/dashboard/app-shell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — MovEra Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const [newRequests, newMessages] = await Promise.all([
    db.projectRequest.count({ where: { status: "SUBMITTED" } }),
    db.contactMessage.count({ where: { status: "NEW" } }),
  ]);
  const nav: ShellNavItem[] = [
    { label: "Overview", href: "/admin", icon: "Grid", exact: true },
    { label: "Requests", href: "/admin/requests", icon: "Folder", badge: newRequests },
    { label: "Clients", href: "/admin/clients", icon: "Users" },
    { label: "Messages", href: "/admin/messages", icon: "Inbox", badge: newMessages },
    { label: "Portfolio", href: "/admin/portfolio", icon: "Layers" },
    { label: "Services", href: "/admin/services", icon: "Spark" },
  ];
  return (
    <AppShell nav={nav} user={admin} area="Admin" secondary={{ label: "Client dashboard", href: "/dashboard" }}>
      {children}
    </AppShell>
  );
}
