import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";

/**
 * Data Access Layer for authentication. Every protected page, action and
 * route handler must go through these helpers — the proxy only performs an
 * optimistic cookie check.
 */

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser("/admin");
  if (user.role !== "ADMIN") redirect("/account?denied=admin");
  return user;
}
