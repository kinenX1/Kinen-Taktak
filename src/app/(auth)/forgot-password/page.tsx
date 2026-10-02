import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotForm } from "@/components/auth/forgot-form";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.forgot, robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <>
      <AuthHeading eyebrow={t.auth.recovery} title={t.auth.forgotTitle}>
        {t.auth.forgotLead}
      </AuthHeading>
      <ForgotForm />
      <p className="mt-10 text-sm text-fog-400">
        {t.auth.remembered}{" "}
        <Link href="/login" className="text-fog-50 underline-offset-4 hover:underline">
          {t.auth.backToLogin}
        </Link>
      </p>
    </>
  );
}
