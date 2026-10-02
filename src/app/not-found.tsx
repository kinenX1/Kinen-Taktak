import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { StatusScreen } from "@/components/layout/status-screen";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.notFound, robots: { index: false } };
}

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <StatusScreen
      code="404"
      title={
        <>
          {t.errors.notFound1} <span className="accent-serif text-flux">{t.errors.notFound2}</span>
        </>
      }
      actions={
        <>
          <ButtonLink href="/" arrow>
            {t.common.backToHome}
          </ButtonLink>
          <ButtonLink href="/work" variant="secondary">
            {t.errors.explore}
          </ButtonLink>
        </>
      }
    >
      {t.errors.notFoundBody}
    </StatusScreen>
  );
}
