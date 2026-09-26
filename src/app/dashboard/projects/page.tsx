import { requireUser } from "@/lib/auth/dal";
import { getUserRequests } from "@/lib/data/client";
import { ButtonLink } from "@/components/ui/button";
import { Briefcase } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";

export const metadata = { title: "My Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await getUserRequests(user.id, { projectsOnly: true });

  return (
    <>
      <PageHeader eyebrow="Projects" title="My projects" description="Requests that have become active or delivered projects." />
      <Panel>
        {projects.length ? (
          <RequestList items={projects} />
        ) : (
          <EmptyState
            icon={<Briefcase size={20} />}
            title="No active projects yet"
            action={
              <ButtonLink href="/dashboard/requests" size="sm" variant="secondary">
                View your requests
              </ButtonLink>
            }
          >
            Once a request moves to <em>In progress</em>, it becomes a project and appears here.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
