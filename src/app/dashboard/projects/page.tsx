import { requireUser } from "@/lib/auth/dal";
import { getUserRequests } from "@/lib/data/client";
import { getI18n } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/button";
import { Briefcase } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.projects.title };
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const p = t.dashboard.projects;
  const projects = await getUserRequests(user.id, { projectsOnly: true });

  return (
    <>
      <PageHeader eyebrow={p.eyebrow} title={p.title} description={p.lead} />
      <Panel>
        {projects.length ? (
          <RequestList items={projects} />
        ) : (
          <EmptyState
            icon={<Briefcase size={20} />}
            title={p.empty}
            action={
              <ButtonLink href="/dashboard/requests" size="sm" variant="secondary">
                {p.viewRequests}
              </ButtonLink>
            }
          >
            {p.emptyBody1} <em>{t.options.statuses.IN_PROGRESS.label}</em>, {p.emptyBody2}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
