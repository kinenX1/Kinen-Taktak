import "server-only";
import type { Prisma, ProjectType, RequestStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Admin-only queries. Callers must have passed `requireAdmin()`. */

export async function getAdminOverview() {
  const [byStatus, totalClients, newMessages, recent] = await Promise.all([
    db.projectRequest.groupBy({ by: ["status"], _count: true }),
    db.user.count({ where: { role: "CLIENT" } }),
    db.contactMessage.count({ where: { status: "NEW" } }),
    db.projectRequest.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        reference: true,
        title: true,
        status: true,
        projectType: true,
        contactName: true,
        createdAt: true,
      },
    }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Record<string, number>;
  return { counts, totalClients, newMessages, recent };
}

export type RequestFilters = {
  q?: string;
  status?: RequestStatus;
  type?: ProjectType;
  page?: number;
};

export const ADMIN_PAGE_SIZE = 20;

export async function searchRequests({ q, status, type, page = 1 }: RequestFilters) {
  const where: Prisma.ProjectRequestWhereInput = {
    // Drafts are private to the client until submitted.
    status: status ?? { not: "DRAFT" },
    ...(type ? { projectType: type } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { contactEmail: { contains: q, mode: "insensitive" } },
            { contactCompany: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    db.projectRequest.count({ where }),
    db.projectRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        projectType: true,
        budget: true,
        contactName: true,
        contactEmail: true,
        contactCompany: true,
        createdAt: true,
      },
    }),
  ]);
  return { total, items, pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export function getRequestForAdmin(reference: string) {
  return db.projectRequest.findFirst({
    where: { reference, status: { not: "DRAFT" } },
    include: {
      user: { select: { id: true, name: true, email: true, company: true, createdAt: true } },
      files: { orderBy: { createdAt: "asc" } },
      updates: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
    },
  });
}

export async function searchClients(q?: string) {
  return db.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      country: true,
      role: true,
      createdAt: true,
      _count: { select: { projectRequests: { where: { status: { not: "DRAFT" } } } } },
    },
  });
}

export function getClient(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      country: true,
      role: true,
      createdAt: true,
      projectRequests: {
        where: { status: { not: "DRAFT" } },
        orderBy: { createdAt: "desc" },
        select: { reference: true, title: true, status: true, projectType: true, createdAt: true },
      },
    },
  });
}

export function getMessages(status?: "NEW" | "READ" | "ARCHIVED") {
  return db.contactMessage.findMany({
    where: status ? { status } : { status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
