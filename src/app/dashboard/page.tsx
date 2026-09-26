import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getUserOverview, getUserRequests } from "@/lib/data/client";
import { labelFor } from "@/config/project-brief";
import { formatDateTime } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { Folder, Plus } from "@/components/ui/icons";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";

export const metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const params = await searchParams;
  const [{ counts, latestUpdates }, requests] = await Promise.all([getUserOverview(user.id), getUserRequests(user.id)]);

  const active = ["SUBMITTED", "UNDER_REVIEW", "CONTACTED", "PROPOSAL"].reduce((n, s) => n + (counts[s] ?? 0), 0);
  const stats = [
    { label: "Open requests", value: active, hint: "Submitted and being reviewed" },
    { label: "In progress", value: counts.IN_PROGRESS ?? 0, hint: "Being designed and built" },
    { label: "Completed", value: counts.COMPLETED ?? 0, hint: "Delivered projects" },
    { label: "Drafts", value: counts.DRAFT ?? 0, hint: "Briefs not yet sent" },
  ];

  return (
    <>
      {params.reset === "1" && <Notice tone="success">Your password has been updated and you&apos;re signed in.</Notice>}
      {params.denied === "admin" && <Notice tone="warning">That area is only available to MovEra administrators.</Notice>}

      <PageHeader
        eyebrow="Overview"
        title={
          <>
            Welcome back, <span className="accent-serif text-flux">{user.name.split(" ")[0]}.</span>
          </>
        }
        description="Here's where your projects stand."
        actions={
          <ButtonLink href="/start-project" arrow>
            New project request
          </ButtonLink>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-ink-900 p-5 md:p-6">
            <dt className="text-sm text-fog-400">{s.label}</dt>
            <dd className="mt-3 text-4xl font-medium tracking-[-0.04em] text-fog-50">{s.value}</dd>
            <dd className="mt-1 text-xs text-fog-500">{s.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Recent requests"
          action={
            requests.length > 0 && (
              <Link href="/dashboard/requests" className="text-xs text-fog-400 hover:text-fog-50">
                View all
              </Link>
            )
          }
        >
          {requests.length ? (
            <RequestList items={requests.slice(0, 5)} />
          ) : (
            <EmptyState
              icon={<Folder size={20} />}
              title="No project requests yet"
              action={
                <ButtonLink href="/start-project" size="sm" arrow>
                  Start a project
                </ButtonLink>
              }
            >
              When you send a project brief, it will appear here with its status and every update from our team.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Latest updates">
          {latestUpdates.length ? (
            <ol className="space-y-5 p-5">
              {latestUpdates.map((u) => (
                <li key={u.id} className="relative border-l border-line pl-4">
                  <span aria-hidden="true" className="absolute -left-[3px] top-1.5 size-[5px] rounded-full bg-flux" />
                  <Link href={`/dashboard/requests/${u.request.reference}`} className="block text-sm font-medium text-fog-50 hover:underline">
                    {u.request.title}
                  </Link>
                  <p className="mt-1 text-sm text-fog-400">
                    {u.kind === "STATUS_CHANGE" ? `Status changed to ${labelFor.status(u.toStatus)}` : "New message from MovEra"}
                  </p>
                  <p className="mt-1 font-mono text-2xs text-fog-500">{formatDateTime(u.createdAt)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-5 text-sm leading-relaxed text-fog-400">Status changes and messages from our team will show up here.</p>
          )}
        </Panel>
      </div>

      <Link
        href="/start-project"
        className="group mt-8 flex items-center justify-between gap-6 overflow-hidden rounded-lg border border-line bg-gradient-to-r from-flux/[0.1] via-ink-900 to-ink-900 p-6 transition-colors hover:border-flux/40 md:p-8"
      >
        <div>
          <p className="text-xl font-medium tracking-[-0.02em] md:text-2xl">Have a new idea?</p>
          <p className="mt-1 text-sm text-fog-400">Send another brief — it takes about five minutes.</p>
        </div>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-flux text-ink-950 transition-transform duration-500 group-hover:rotate-90">
          <Plus size={20} />
        </span>
      </Link>
    </>
  );
}
