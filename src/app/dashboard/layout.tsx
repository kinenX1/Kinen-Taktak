import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { AppShell, type ShellNavItem } from "@/components/dashboard/app-shell";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s — MovEra Client Portal" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const nav: ShellNavItem[] = [
    { label: "Overview", href: "/dashboard", icon: "Grid", exact: true },
    { label: "My Projects", href: "/dashboard/projects", icon: "Briefcase" },
    { label: "Project Requests", href: "/dashboard/requests", icon: "Folder" },
    { label: "Profile", href: "/dashboard/profile", icon: "User" },
    { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
  ];
  return (
    <AppShell
      nav={nav}
      user={user}
      area="Client"
      secondary={user.role === "ADMIN" ? { label: "Open admin panel", href: "/admin" } : { label: "Back to website", href: "/" }}
    >
      {children}
    </AppShell>
  );
}
