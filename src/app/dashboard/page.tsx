import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getUserOverview, getUserRequests } from "@/lib/data/client";
import { fmt } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { formatDateTime } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { Camera, Chat, Folder, Plus } from "@/components/ui/icons";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";
import { CountUp } from "@/components/motion/count-up";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.overview.title };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const params = await searchParams;
  const { locale, t } = await getI18n();
  const o = t.dashboard.overview;
  const [{ counts, latestUpdates, unread }, requests] = await Promise.all([getUserOverview(user.id), getUserRequests(user.id)]);

  const active = ["SUBMITTED", "UNDER_REVIEW", "CONTACTED", "PROPOSAL"].reduce((n, s) => n + (counts[s] ?? 0), 0);
  const stats = [
    { label: o.stats.open, value: active, hint: o.stats.openHint },
    { label: o.stats.progress, value: counts.IN_PROGRESS ?? 0, hint: o.stats.progressHint },
    { label: o.stats.completed, value: counts.COMPLETED ?? 0, hint: o.stats.completedHint },
    { label: o.stats.drafts, value: counts.DRAFT ?? 0, hint: o.stats.draftsHint },
  ];

  return (
    <>
      {params.reset === "1" && <Notice tone="success">{o.resetDone}</Notice>}
      {params.denied === "admin" && <Notice tone="warning">{o.deniedAdmin}</Notice>}

      <PageHeader
        eyebrow={o.title}
        title={
          <>
            {o.welcome} <span className="accent-serif text-flux">{user.name.split(" ")[0]}.</span>
          </>
        }
        description={o.lead}
        actions={
          <ButtonLink href="/start-project" arrow>
            {o.newRequest}
          </ButtonLink>
        }
      />

      {unread > 0 && (
        <Link
          href="/dashboard/messages"
          className="beam-border group mb-8 flex items-center gap-4 rounded-lg bg-ink-900 p-5 transition-colors hover:bg-ink-850"
        >
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-flux/15 text-flux">
            <Chat size={20} />
            <span className="absolute -right-0.5 -top-0.5 size-3 animate-pulse-dot rounded-full bg-flux" />
          </span>
          <span className="flex-1 font-medium text-fog-50">{fmt(o.unreadTitle, { count: unread })}</span>
          <span className="text-sm text-fog-400 transition-colors group-hover:text-flux">{o.unreadCta} →</span>
        </Link>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="scanline bg-ink-900 p-5 md:p-6">
            <dt className="text-sm text-fog-400">{s.label}</dt>
            <dd className="mt-3 text-4xl font-medium tracking-[-0.04em] text-fog-50">
              <CountUp value={s.value} />
            </dd>
            <dd className="mt-1 text-xs text-fog-500">{s.hint}</dd>
          </div>
        ))}
      </dl>

      {!user.avatarAt && (
        <Link
          href="/dashboard/profile"
          className="group mt-8 flex items-center gap-4 rounded-lg border border-dashed border-line-strong p-5 transition-colors hover:border-flux/50"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-fog-200 transition-colors group-hover:border-flux group-hover:text-flux">
            <Camera size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-fog-50">{o.photoTitle}</span>
            <span className="block text-sm text-fog-400">{o.photoBody}</span>
          </span>
          <span className="hidden text-sm text-fog-400 transition-colors group-hover:text-flux sm:block">{o.photoCta} →</span>
        </Link>
      )}

      <div className="mt-8 grid gap-8 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title={o.recent}
          action={
            requests.length > 0 && (
              <Link href="/dashboard/requests" className="text-xs text-fog-400 hover:text-fog-50">
                {t.common.viewAll}
              </Link>
            )
          }
        >
          {requests.length ? (
            <RequestList items={requests.slice(0, 5)} />
          ) : (
            <EmptyState
              icon={<Folder size={20} />}
              title={o.noRequests}
              action={
                <ButtonLink href="/start-project" size="sm" arrow>
                  {o.startProject}
                </ButtonLink>
              }
            >
              {o.noRequestsBody}
            </EmptyState>
          )}
        </Panel>

        <Panel title={o.latest}>
          {latestUpdates.length ? (
            <ol className="space-y-5 p-5">
              {latestUpdates.map((u) => (
                <li key={u.id} className="relative border-l border-line pl-4">
                  <span aria-hidden="true" className="absolute -left-[3px] top-1.5 size-[5px] rounded-full bg-flux" />
                  <Link href={`/dashboard/requests/${u.request.reference}`} className="block text-sm font-medium text-fog-50 hover:underline">
                    {u.request.title}
                  </Link>
                  <p className="mt-1 text-sm text-fog-400">
                    {u.kind === "STATUS_CHANGE" && u.toStatus
                      ? fmt(o.statusChanged, { status: t.options.statuses[u.toStatus].label })
                      : o.newMessage}
                  </p>
                  <p className="mt-1 font-mono text-2xs text-fog-500">{formatDateTime(u.createdAt, locale)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-5 text-sm leading-relaxed text-fog-400">{o.latestEmpty}</p>
          )}
        </Panel>
      </div>

      <Link
        href="/start-project"
        className="group mt-8 flex items-center justify-between gap-6 overflow-hidden rounded-lg border border-line bg-gradient-to-r from-flux/[0.1] via-ink-900 to-ink-900 p-6 transition-colors hover:border-flux/40 md:p-8"
      >
        <div>
          <p className="text-xl font-medium tracking-[-0.02em] md:text-2xl">{o.ideaTitle}</p>
          <p className="mt-1 text-sm text-fog-400">{o.ideaBody}</p>
        </div>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-flux text-ink-950 transition-transform duration-500 group-hover:rotate-90">
          <Plus size={20} />
        </span>
      </Link>
    </>
  );
}
