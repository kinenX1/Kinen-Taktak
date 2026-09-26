import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDraftAction } from "@/actions/project-request";
import { requireUser } from "@/lib/auth/dal";
import { getUserRequest } from "@/lib/data/client";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ArrowLeft } from "@/components/ui/icons";
import { Notice, PageHeader, Panel } from "@/components/dashboard/page-header";
import { StatusTimeline } from "@/components/dashboard/status-timeline";
import { BriefDetails } from "@/components/dashboard/brief-details";
import { UpdateFeed } from "@/components/dashboard/update-feed";

export async function generateMetadata({ params }: PageProps<"/dashboard/requests/[reference]">): Promise<Metadata> {
  const { reference } = await params;
  return { title: reference };
}

export default async function RequestDetailPage({ params, searchParams }: PageProps<"/dashboard/requests/[reference]">) {
  const user = await requireUser();
  const { reference } = await params;
  const { saved } = await searchParams;
  // Scoped to the signed-in user: other users' references return 404.
  const request = await getUserRequest(user.id, reference);
  if (!request) notFound();

  const isDraft = request.status === "DRAFT";

  return (
    <>
      <Link href="/dashboard/requests" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> All requests
      </Link>
      {saved === "draft" && <Notice tone="success">Draft saved. You can finish and send it whenever you&apos;re ready.</Notice>}

      <PageHeader
        eyebrow={request.reference}
        title={request.title}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={request.status} />
            <span className="text-sm">
              {request.submittedAt ? `Submitted ${formatDate(request.submittedAt)}` : `Created ${formatDate(request.createdAt)}`}
            </span>
          </span>
        }
        actions={
          isDraft ? (
            <>
              <form action={deleteDraftAction}>
                <input type="hidden" name="reference" value={request.reference} />
                <ConfirmSubmit>Delete draft</ConfirmSubmit>
              </form>
              <ButtonLink href={`/start-project?draft=${request.reference}`} arrow>
                Continue brief
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      <Panel title="Status" className="mb-8">
        <div className="p-5 md:p-6">
          <StatusTimeline status={request.status} />
        </div>
      </Panel>

      <div className="grid gap-8 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <BriefDetails request={request} files={request.files} />
        </div>
        <Panel title="Updates from MovEra" className="self-start">
          <UpdateFeed updates={request.updates} />
        </Panel>
      </div>
    </>
  );
}
