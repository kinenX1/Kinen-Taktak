import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEmailLog } from "@/lib/data/admin";
import { ArrowLeft } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";
import { EmailComposer } from "@/components/admin/email-composer";
import { EmailHistory } from "@/components/admin/email-history";

export const metadata = { title: "Write an email" };

export default async function ComposePage({ searchParams }: PageProps<"/admin/audience/compose">) {
  const sp = await searchParams;
  const to = z.email().safeParse(typeof sp.to === "string" ? sp.to.trim().toLowerCase() : "");
  const name = typeof sp.name === "string" ? sp.name.slice(0, 100) : undefined;
  const locale = sp.locale === "fr" ? "fr" : "en";

  const back = (
    <Link href="/admin/audience" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
      <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Audience
    </Link>
  );
  if (!to.success) {
    return (
      <>
        {back}
        <EmptyState title="Choose someone to write to">Pick a person from the audience list.</EmptyState>
      </>
    );
  }

  const [user, history] = await Promise.all([
    db.user.findUnique({ where: { email: to.data }, select: { id: true } }),
    getEmailLog(to.data),
  ]);

  return (
    <>
      {back}
      <PageHeader eyebrow="Write an email" title={name ?? to.data} description={name ? to.data : undefined} />
      <div className="grid gap-8 xl:grid-cols-5">
        <Panel title="New email" className="xl:col-span-3">
          <EmailComposer to={to.data} name={name} locale={locale} recipientId={user?.id} />
        </Panel>
        <Panel title={`History (${history.length})`} className="self-start xl:col-span-2">
          <EmailHistory emails={history} />
        </Panel>
      </div>
    </>
  );
}
