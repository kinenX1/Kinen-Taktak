import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { avatarUrl } from "@/lib/avatar";
import { getCurrentUser } from "@/lib/auth/dal";
import type { NavUser } from "@/components/layout/account-menu";

/** The signed-in user as shown in navigation, with their unread chat count. */
export const getNavUser = cache(async (): Promise<NavUser | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const unread = await db.projectMessage.count({ where: { fromStaff: true, readAt: null, request: { userId: user.id } } });
  return { name: user.name, email: user.email, role: user.role, avatar: avatarUrl(user), unread };
});
