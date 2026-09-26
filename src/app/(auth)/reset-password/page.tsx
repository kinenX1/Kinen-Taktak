import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ResetForm } from "@/components/auth/reset-form";
import { FormMessage } from "@/components/ui/field";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <>
      <AuthHeading eyebrow="Account recovery" title="Choose a new password." />
      {typeof token === "string" && token.length > 10 ? (
        <ResetForm token={token} />
      ) : (
        <FormMessage>
          This reset link is incomplete.{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new one
          </Link>
          .
        </FormMessage>
      )}
    </>
  );
}
