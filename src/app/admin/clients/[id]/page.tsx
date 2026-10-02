import Link from "next/link";
import { notFound } from "next/navigation";
import { setUserRoleAction } from "@/actions/admin";
import { requireAdmin } from "@/lib/auth/dal";
import { getClient } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Folder } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { RequestList } from "@/components/dashboard/request-list";
import { UserAvatar } from "@/components/ui/avatar";
import { avatarUrl } from "@/lib/avatar";
import { EmailComposer } from "@/components/admin/email-composer";
import { EmailHistory } from "@/components/admin/email-history";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const details = [
    { k: "Email", v: client.email },
    { k: "Phone", v: client.phone },
    { k: "Company", v: client.company },
    { k: "Country", v: client.country },
    { k: "Joined", v: formatDate(client.createdAt) },
    { k: "Language", v: client.locale === "fr" ? "French" : "English" },
  ];

  return (
    <>
      <Link href="/admin/clients" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> All clients
      </Link>
      <PageHeader
        eyebrow="Client"
        title={
          <span className="flex items-center gap-4">
            <UserAvatar name={client.name} src={avatarUrl(client)} size={56} ring />
            {client.name}
          </span>
        }
        description={client.role === "ADMIN" ? <Badge tone="accent">Administrator</Badge> : undefined}
        actions={
          client.id !== admin.id && (
            <form action={setUserRoleAction}>
              <input type="hidden" name="userId" value={client.id} />
              <input type="hidden" name="role" value={client.role === "ADMIN" ? "CLIENT" : "ADMIN"} />
              <Button type="submit" variant="secondary" size="sm">
                {client.role === "ADMIN" ? "Remove admin access" : "Make administrator"}
              </Button>
            </form>
          )
        }
      />
      <div className="grid gap-8 xl:grid-cols-3">
        <Panel title="Details">
          <dl className="divide-y divide-line">
            {details.map((d) => (
              <div key={d.k} className="flex justify-between gap-4 px-5 py-3 text-sm">
                <dt className="text-fog-500">{d.k}</dt>
                <dd className="truncate text-right">{d.v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={`Requests (${client.projectRequests.length})`} className="xl:col-span-2">
          {client.projectRequests.length ? (
            <RequestList
              hrefBase="/admin/requests"
              items={client.projectRequests.map((r) => ({ ...r, budget: null, updatedAt: r.createdAt }))}
            />
          ) : (
            <EmptyState icon={<Folder size={20} />} title="No submitted requests" />
          )}
        </Panel>
        <Panel title="Email this client" className="xl:col-span-2">
          <EmailComposer to={client.email} name={client.name} recipientId={client.id} locale={client.locale} />
        </Panel>
        <Panel title={`Emails (${client.receivedEmails.length})`} className="self-start">
          <EmailHistory emails={client.receivedEmails} />
        </Panel>
      </div>
    </>
  );
}
