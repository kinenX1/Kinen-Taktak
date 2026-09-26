import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/utils";
import { AuthHeading } from "@/components/auth/auth-heading";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  if (await getCurrentUser()) redirect(next ?? "/dashboard");

  return (
    <>
      <AuthHeading eyebrow="Client portal" title={<>Create your <span className="accent-serif text-flux">account.</span></>}>
        Send project briefs and track every update in one place.
      </AuthHeading>
      <RegisterForm next={next} />
      <p className="mt-10 text-sm text-fog-400">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="text-fog-50 underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
