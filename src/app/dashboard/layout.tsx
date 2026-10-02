import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getNavUser } from "@/lib/data/nav";
import { getI18n } from "@/i18n/server";
import { AppShell, type ShellNavItem } from "@/components/dashboard/app-shell";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s — MovEra" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await getNavUser();
  if (!user) redirect("/login?next=/dashboard");
  const { t } = await getI18n();
  const n = t.dashboard.nav;
  const nav: ShellNavItem[] = [
    { label: n.overview, href: "/dashboard", icon: "Grid", exact: true },
    { label: n.projects, href: "/dashboard/projects", icon: "Briefcase" },
    { label: n.requests, href: "/dashboard/requests", icon: "Folder" },
    { label: n.messages, href: "/dashboard/messages", icon: "Chat", badge: user.unread },
    { label: n.profile, href: "/dashboard/profile", icon: "User" },
    { label: n.settings, href: "/dashboard/settings", icon: "Settings" },
  ];
  return (
    <AppShell
      nav={nav}
      user={user}
      area={t.dashboard.area}
      showLanguage
      secondary={user.role === "ADMIN" ? { label: n.openAdmin, href: "/admin" } : { label: n.backToSite, href: "/" }}
    >
      {children}
    </AppShell>
  );
}
