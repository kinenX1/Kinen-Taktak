import type { Metadata } from "next";
import { db } from "@/lib/db";
import { avatarUrl } from "@/lib/avatar";
import { requireAdmin } from "@/lib/auth/dal";
import { en } from "@/i18n/dictionaries/en";
import { I18nProvider } from "@/i18n/client";
import { AppShell, type ShellNavItem } from "@/components/dashboard/app-shell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — MovEra Admin" },
  robots: { index: false, follow: false },
};

/** The admin panel is always in English, whatever language the site is shown in. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const [newRequests, newMessages, unreadChats, newApplications] = await Promise.all([
    db.projectRequest.count({ where: { status: "SUBMITTED" } }),
    db.contactMessage.count({ where: { status: "NEW" } }),
    db.projectMessage.count({ where: { fromStaff: false, readAt: null } }),
    db.jobApplication.count({ where: { status: "NEW" } }),
  ]);
  const nav: ShellNavItem[] = [
    { label: "Overview", href: "/admin", icon: "Grid", exact: true },
    { label: "Requests", href: "/admin/requests", icon: "Folder", badge: newRequests },
    { label: "Chats", href: "/admin/chats", icon: "Chat", badge: unreadChats },
    { label: "Clients", href: "/admin/clients", icon: "Users" },
    { label: "Messages", href: "/admin/messages", icon: "Inbox", badge: newMessages },
    { label: "Careers", href: "/admin/careers", icon: "Rocket", badge: newApplications },
    { label: "Audience & email", href: "/admin/audience", icon: "Mail" },
    { label: "Portfolio", href: "/admin/portfolio", icon: "Layers" },
    { label: "Services", href: "/admin/services", icon: "Spark" },
  ];
  const user = { name: admin.name, email: admin.email, role: admin.role, avatar: avatarUrl(admin) };
  return (
    <I18nProvider locale="en" t={en}>
      <AppShell nav={nav} user={user} area="Admin" secondary={{ label: "Client dashboard", href: "/dashboard" }}>
        {children}
      </AppShell>
    </I18nProvider>
  );
}
