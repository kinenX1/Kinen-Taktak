import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { LegalPage } from "@/components/legal/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.terms.title, description: t.meta.terms.description, alternates: { canonical: "/terms" } };
}

export default async function TermsPage() {
  const { t } = await getI18n();
  return <LegalPage doc={t.legal.terms} t={t.legal} />;
}
