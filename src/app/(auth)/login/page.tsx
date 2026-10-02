import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/utils";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.login, robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  if (await getCurrentUser()) redirect(next ?? "/dashboard");
  const { t } = await getI18n();

  return (
    <>
      <AuthHeading eyebrow={t.auth.clientPortal} title={t.auth.loginTitle}>
        {t.auth.loginLead}
      </AuthHeading>
      <LoginForm next={next} />
      <p className="mt-10 text-sm text-fog-400">
        {t.auth.newTo}{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="text-fog-50 underline-offset-4 hover:underline">
          {t.auth.createAccountLink}
        </Link>
      </p>
    </>
  );
}
