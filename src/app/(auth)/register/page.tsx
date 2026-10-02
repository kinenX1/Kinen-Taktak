import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/utils";
import { AuthHeading } from "@/components/auth/auth-heading";
import { RegisterForm } from "@/components/auth/register-form";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.register, robots: { index: false } };
}

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  if (await getCurrentUser()) redirect(next ?? "/dashboard");
  const { t } = await getI18n();

  return (
    <>
      <AuthHeading
        eyebrow={t.auth.clientPortal}
        title={
          <>
            {t.auth.registerTitle1} <span className="accent-serif text-flux">{t.auth.registerTitle2}</span>
          </>
        }
      >
        {t.auth.registerLead}
      </AuthHeading>
      <RegisterForm next={next} />
      <p className="mt-10 text-sm text-fog-400">
        {t.auth.haveAccount}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-fog-50 underline-offset-4 hover:underline">
          {t.auth.logInLink}
        </Link>
      </p>
    </>
  );
}
