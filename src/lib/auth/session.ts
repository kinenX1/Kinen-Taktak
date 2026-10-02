import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "movera_session";
/** UI hint cookie set by earlier versions; now only cleared on sign-out. */
const SIGNED_IN_HINT_COOKIE = "movera_signed_in";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renew when < 15 days left

export async function createSession(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, userAgent },
  });
  await setSessionCookie(token, expiresAt);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires: expiresAt });
}

/**
 * Validates the session cookie against the database. Memoised per request.
 * Returns the session with a minimal, safe user projection.
 */
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, locale: true, avatarAt: true } },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Sliding expiration. Cookie writes are only allowed in actions/route
  // handlers, so renew the DB row here and refresh the cookie best-effort.
  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.update({ where: { id: session.id }, data: { expiresAt } });
    try {
      await setSessionCookie(token, expiresAt);
    } catch {
      // Rendering a Server Component — the cookie will be refreshed on the next action.
    }
  }

  return session;
});

export async function invalidateCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(SIGNED_IN_HINT_COOKIE);
}

export async function invalidateAllSessions(userId: string, exceptCurrent = false) {
  if (!exceptCurrent) {
    await db.session.deleteMany({ where: { userId } });
    return;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({
    where: { userId, ...(token ? { id: { not: hashToken(token) } } : {}) },
  });
}
