import "server-only";
import type { ApplicationStatus, Prisma, ProjectType, RequestStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Admin-only queries. Callers must have passed `requireAdmin()`. */

export async function getAdminOverview() {
  const [byStatus, totalClients, newMessages, unreadChats, newApplications, subscribers, recent] = await Promise.all([
    db.projectRequest.groupBy({ by: ["status"], _count: true }),
    db.user.count({ where: { role: "CLIENT" } }),
    db.contactMessage.count({ where: { status: "NEW" } }),
    db.projectMessage.count({ where: { fromStaff: false, readAt: null } }),
    db.jobApplication.count({ where: { status: "NEW" } }),
    db.subscriber.count({ where: { unsubscribedAt: null } }),
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
  return { counts, totalClients, newMessages, unreadChats, newApplications, subscribers, recent };
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
      user: { select: { id: true, name: true, email: true, company: true, createdAt: true, avatarAt: true, locale: true } },
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
      avatarAt: true,
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
      locale: true,
      avatarAt: true,
      createdAt: true,
      receivedEmails: { orderBy: { createdAt: "desc" }, take: 50, include: { sentBy: { select: { name: true } } } },
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
    include: { _count: { select: { emails: true } } },
  });
}

// ── Careers ────────────────────────────────────────────────

export async function searchApplications({ q, status, opening }: { q?: string; status?: ApplicationStatus; opening?: string }) {
  return db.jobApplication.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(opening ? (opening === "spontaneous" ? { openingId: null } : { openingId: opening }) : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
              { roleTitle: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      reference: true,
      fullName: true,
      email: true,
      roleTitle: true,
      status: true,
      country: true,
      cvName: true,
      createdAt: true,
    },
  });
}

export function getApplication(id: string) {
  return db.jobApplication.findUnique({
    where: { id },
    include: {
      opening: { select: { id: true, slug: true, title: true } },
      emails: { orderBy: { createdAt: "desc" }, include: { sentBy: { select: { name: true } } } },
    },
  });
}

export function getOpeningsForAdmin() {
  return db.jobOpening.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { applications: true } } },
  });
}

// ── Audience & email ───────────────────────────────────────

export type AudienceEntry = {
  email: string;
  name: string | null;
  sources: ("client" | "contact" | "applicant" | "subscriber")[];
  lastSeen: Date;
  locale: string | null;
  userId?: string;
  subscriberId?: string;
};

/** Everyone who has given MovEra their email, merged by address. */
export async function getAudience(q?: string): Promise<AudienceEntry[]> {
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const [users, contacts, applicants, subscribers] = await Promise.all([
    db.user.findMany({ where: like ? { OR: [{ email: like }, { name: like }] } : {}, select: { id: true, email: true, name: true, locale: true, createdAt: true }, take: 500 }),
    db.contactMessage.findMany({ where: like ? { OR: [{ email: like }, { name: like }] } : {}, select: { email: true, name: true, createdAt: true }, take: 500 }),
    db.jobApplication.findMany({ where: like ? { OR: [{ email: like }, { fullName: like }] } : {}, select: { email: true, fullName: true, locale: true, createdAt: true }, take: 500 }),
    db.subscriber.findMany({ where: { unsubscribedAt: null, ...(like ? { email: like } : {}) }, select: { id: true, email: true, name: true, locale: true, createdAt: true }, take: 500 }),
  ]);

  const map = new Map<string, AudienceEntry>();
  const add = (email: string, name: string | null, source: AudienceEntry["sources"][number], at: Date, extra: Partial<AudienceEntry> = {}) => {
    const key = email.toLowerCase();
    const entry = map.get(key) ?? { email: key, name: null, sources: [], lastSeen: at, locale: null };
    if (!entry.sources.includes(source)) entry.sources.push(source);
    entry.name ??= name;
    if (at > entry.lastSeen) entry.lastSeen = at;
    entry.locale ??= extra.locale ?? null;
    if (extra.userId) entry.userId = extra.userId;
    if (extra.subscriberId) entry.subscriberId = extra.subscriberId;
    map.set(key, entry);
  };
  users.forEach((u) => add(u.email, u.name, "client", u.createdAt, { userId: u.id, locale: u.locale }));
  contacts.forEach((c) => add(c.email, c.name, "contact", c.createdAt));
  applicants.forEach((a) => add(a.email, a.fullName, "applicant", a.createdAt, { locale: a.locale }));
  subscribers.forEach((s) => add(s.email, s.name, "subscriber", s.createdAt, { subscriberId: s.id, locale: s.locale }));
  return [...map.values()].sort((a, b) => +b.lastSeen - +a.lastSeen);
}

export function getEmailLog(to?: string) {
  return db.outboundEmail.findMany({
    where: to ? { to: { equals: to, mode: "insensitive" } } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sentBy: { select: { name: true } } },
  });
}
