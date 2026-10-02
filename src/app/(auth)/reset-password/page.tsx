import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ResetForm } from "@/components/auth/reset-form";
import { FormMessage } from "@/components/ui/field";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.reset, robots: { index: false } };
}

/** Checks the link up front so an expired or used one never shows a form that can only fail. */
async function isUsableToken(token: string) {
  if (token.length < 10 || token.length > 100) return false;
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return !!record && !record.usedAt && record.expiresAt.getTime() > Date.now();
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && (await isUsableToken(token));
  const { t } = await getI18n();
  return (
    <>
      <AuthHeading eyebrow={t.auth.recovery} title={t.auth.resetTitle} />
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <FormMessage>
          {t.auth.invalidLink}{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            {t.auth.requestNew}
          </Link>
          .
        </FormMessage>
      )}
    </>
  );
}
