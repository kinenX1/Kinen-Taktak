import { requireUser } from "@/lib/auth/dal";
import { getUserRequests } from "@/lib/data/client";
import { fmt } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { Folder } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.requests.title };
}

export default async function RequestsPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const r = t.dashboard.requests;
  const requests = await getUserRequests(user.id);
  const drafts = requests.filter((x) => x.status === "DRAFT");
  const sent = requests.filter((x) => x.status !== "DRAFT");

  return (
    <>
      <PageHeader
        eyebrow={r.eyebrow}
        title={r.title}
        description={r.lead}
        actions={
          <ButtonLink href="/start-project" arrow>
            {r.newRequest}
          </ButtonLink>
        }
      />
      <Panel title={fmt(r.sent, { count: sent.length })}>
        {sent.length ? (
          <RequestList items={sent} />
        ) : (
          <EmptyState icon={<Folder size={20} />} title={r.nothingSent}>
            {r.nothingSentBody}
          </EmptyState>
        )}
      </Panel>
      {drafts.length > 0 && (
        <Panel title={fmt(r.drafts, { count: drafts.length })} className="mt-8">
          <RequestList items={drafts} />
        </Panel>
      )}
    </>
  );
}
