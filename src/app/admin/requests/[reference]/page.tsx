import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestForAdmin } from "@/lib/data/admin";
import { getThread, markThreadRead } from "@/lib/data/chat";
import { requireAdmin } from "@/lib/auth/dal";
import { avatarUrl } from "@/lib/avatar";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowLeft, Mail } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { BriefDetails } from "@/components/dashboard/brief-details";
import { UpdateFeed } from "@/components/dashboard/update-feed";
import { StatusTimeline } from "@/components/dashboard/status-timeline";
import { NoteForm, StatusForm } from "@/components/admin/request-actions";
import { ChatPanel } from "@/components/chat/chat-panel";
import { EmailComposer } from "@/components/admin/email-composer";

export async function generateMetadata({ params }: PageProps<"/admin/requests/[reference]">): Promise<Metadata> {
  const { reference } = await params;
  return { title: reference };
}

export default async function AdminRequestPage({ params }: PageProps<"/admin/requests/[reference]">) {
  const { reference } = await params;
  const admin = await requireAdmin();
  const request = await getRequestForAdmin(reference);
  if (!request) notFound();
  await markThreadRead(request.id, "staff");
  const thread = await getThread(request.id);

  return (
    <>
      <Link href="/admin/requests" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> All requests
      </Link>
      <PageHeader
        eyebrow={request.reference}
        title={request.title}
        description={
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={request.status} />
            Submitted {request.submittedAt ? formatDate(request.submittedAt) : "—"} by{" "}
            <Link href={`/admin/clients/${request.user.id}`} className="text-fog-50 underline-offset-4 hover:underline">
              {request.user.name}
            </Link>
          </span>
        }
        actions={
          <a
            href={`mailto:${request.contactEmail}?subject=${encodeURIComponent(`${request.reference} — ${request.title}`)}`}
            className={buttonClasses({ variant: "secondary" })}
          >
            <Mail size={16} /> Email client
          </a>
        }
      />

      <Panel title="Progress" className="mb-8">
        <div className="p-5 md:p-6">
          <StatusTimeline status={request.status} />
        </div>
      </Panel>

      <div className="mb-8">
        <ChatPanel
          title="Chat with the client"
          lead="The client sees these messages in their dashboard and gets an email for new replies."
          live="Live"
          requestId={request.id}
          side="staff"
          initial={thread}
          me={{ name: admin.name, avatar: avatarUrl(admin) }}
          other={{ name: request.user.name, avatar: avatarUrl(request.user) }}
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <BriefDetails request={request} files={request.files} />
        </div>
        <div className="space-y-8">
          <Panel title="Change status">
            <StatusForm requestId={request.id} status={request.status} />
          </Panel>
          <Panel title="Add a note">
            <NoteForm requestId={request.id} />
          </Panel>
          <Panel title="Email the client">
            <EmailComposer
              to={request.contactEmail}
              name={request.contactName}
              recipientId={request.user.id}
              defaultSubject={`${request.reference} — ${request.title}`}
              locale={request.user.locale}
            />
          </Panel>
          <Panel title="Activity">
            <UpdateFeed updates={request.updates} showVisibility />
          </Panel>
        </div>
      </div>
    </>
  );
}
