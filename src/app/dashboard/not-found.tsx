import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { Folder } from "@/components/ui/icons";
import { EmptyState } from "@/components/dashboard/page-header";

export default async function NotFound() {
  const { t } = await getI18n();
  const n = t.dashboard.notFound;
  return (
    <>
      <h1 className="sr-only">{t.meta.notFound}</h1>
      <EmptyState
        icon={<Folder size={20} />}
        title={n.title}
        action={
          <ButtonLink href="/dashboard" size="sm" variant="secondary">
            {n.back}
          </ButtonLink>
        }
      >
        {n.body}
      </EmptyState>
    </>
  );
}
