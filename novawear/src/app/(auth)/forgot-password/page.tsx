import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, ForgotForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading eyebrow="Account recovery" title="Forgot password">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </AuthHeading>
      <ForgotForm />
      <p className="mt-8 text-[0.9375rem] text-body">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
