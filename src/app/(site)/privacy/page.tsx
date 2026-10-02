import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { LegalPage } from "@/components/legal/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.privacy.title, description: t.meta.privacy.description, alternates: { canonical: "/privacy" } };
}

export default async function PrivacyPage() {
  const { t } = await getI18n();
  return <LegalPage doc={t.legal.privacy} t={t.legal} />;
}
