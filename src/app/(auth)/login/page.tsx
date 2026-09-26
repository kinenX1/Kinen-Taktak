import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/utils";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  if (await getCurrentUser()) redirect(next ?? "/dashboard");

  return (
    <>
      <AuthHeading eyebrow="Client portal" title="Welcome back.">
        Log in to follow your projects and send new briefs.
      </AuthHeading>
      <LoginForm next={next} />
      <p className="mt-10 text-sm text-fog-400">
        New to MovEra?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="text-fog-50 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
