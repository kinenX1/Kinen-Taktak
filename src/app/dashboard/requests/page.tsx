import { requireUser } from "@/lib/auth/dal";
import { getUserRequests } from "@/lib/data/client";
import { ButtonLink } from "@/components/ui/button";
import { Folder } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";

export const metadata = { title: "Project Requests" };

export default async function RequestsPage() {
  const user = await requireUser();
  const requests = await getUserRequests(user.id);
  const drafts = requests.filter((r) => r.status === "DRAFT");
  const sent = requests.filter((r) => r.status !== "DRAFT");

  return (
    <>
      <PageHeader
        eyebrow="Requests"
        title="Project requests"
        description="Every brief you've sent, and where it stands."
        actions={
          <ButtonLink href="/start-project" arrow>
            New request
          </ButtonLink>
        }
      />
      <Panel title={`Sent (${sent.length})`}>
        {sent.length ? (
          <RequestList items={sent} />
        ) : (
          <EmptyState icon={<Folder size={20} />} title="Nothing sent yet">
            Your submitted briefs will be listed here.
          </EmptyState>
        )}
      </Panel>
      {drafts.length > 0 && (
        <Panel title={`Drafts (${drafts.length})`} className="mt-8">
          <RequestList items={drafts} />
        </Panel>
      )}
    </>
  );
}
