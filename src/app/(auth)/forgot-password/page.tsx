import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading eyebrow="Account recovery" title="Forgot your password?">
        Enter the email you use for MovEra and we&apos;ll send you a link to choose a new one.
      </AuthHeading>
      <ForgotForm />
      <p className="mt-10 text-sm text-fog-400">
        Remembered it?{" "}
        <Link href="/login" className="text-fog-50 underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
