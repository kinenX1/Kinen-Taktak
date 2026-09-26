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
  const [grouped, latestUpdates] = await Promise.all([
    db.projectRequest.groupBy({ by: ["status"], where: { userId }, _count: true }),
    db.projectUpdate.findMany({
      where: { visibility: "CLIENT", request: { userId } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { request: { select: { reference: true, title: true } } },
    }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Record<string, number>;
  return { counts, latestUpdates };
}

export function getUserProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, company: true, country: true, createdAt: true, role: true },
  });
}

export function getUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, userAgent: true },
  });
}
