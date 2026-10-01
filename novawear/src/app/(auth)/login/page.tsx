import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/utils";
import { AuthHeading, LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  const user = await getCurrentUser();
  if (user) redirect(next ?? (user.role === "ADMIN" ? "/admin" : "/account"));

  return (
    <>
      <AuthHeading eyebrow="Your account" title="Sign in">
        {next === "/checkout" ? "Sign in to place your order." : "Follow your orders and check out faster."}
      </AuthHeading>
      <LoginForm next={next} />
      <p className="mt-8 text-[0.9375rem] text-body">
        New to NovaWear?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-bold text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
