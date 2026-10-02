import "server-only";
import { projectStatuses } from "@/config/project-brief";
import { db } from "@/lib/db";

/**
 * Client dashboard queries. Every query is scoped by `userId`, so a user can
 * only ever read their own requests — never pass an id from the URL alone.
 */

export function getUserRequests(userId: string, opts: { projectsOnly?: boolean } = {}) {
  return db.projectRequest.findMany({
    where: { userId, ...(opts.projectsOnly ? { status: { in: projectStatuses } } : {}) },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      reference: true,
      title: true,
      projectType: true,
      status: true,
      budget: true,
      timeline: true,
      createdAt: true,
      updatedAt: true,
      submittedAt: true,
      _count: { select: { files: true } },
    },
  });
}

export function getUserRequest(userId: string, reference: string) {
  return db.projectRequest.findFirst({
    where: { userId, reference },
    include: {
      files: { orderBy: { createdAt: "asc" } },
      updates: {
        where: { visibility: "CLIENT" },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
}

export async function getUserOverview(userId: string) {
  const [grouped, latestUpdates, unread] = await Promise.all([
    db.projectRequest.groupBy({ by: ["status"], where: { userId }, _count: true }),
    db.projectUpdate.findMany({
      where: { visibility: "CLIENT", request: { userId } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { request: { select: { reference: true, title: true } } },
    }),
    db.projectMessage.count({ where: { fromStaff: true, readAt: null, request: { userId } } }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Record<string, number>;
  return { counts, latestUpdates, unread };
}

/** One conversation per submitted request, newest activity first. */
export async function getUserConversations(userId: string) {
  const requests = await db.projectRequest.findMany({
    where: { userId, status: { not: "DRAFT" } },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      updatedAt: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, fromStaff: true } },
      _count: { select: { messages: { where: { fromStaff: true, readAt: null } } } },
    },
  });
  return requests
    .map((r) => ({ ...r, last: r.messages[0] ?? null, unread: r._count.messages }))
    .sort((a, b) => +(b.last?.createdAt ?? b.updatedAt) - +(a.last?.createdAt ?? a.updatedAt));
}

export function getUserProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, company: true, country: true, createdAt: true, role: true, locale: true, avatarAt: true },
  });
}

export function getUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, userAgent: true },
  });
}
