import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/utils";
import { AuthHeading, RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  if (await getCurrentUser()) redirect(next ?? "/account");

  return (
    <>
      <AuthHeading eyebrow="Join the pack" title="Create account">
        One account for your orders, pre-orders and delivery details.
      </AuthHeading>
      <RegisterForm next={next} />
      <p className="mt-8 text-[0.9375rem] text-body">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
