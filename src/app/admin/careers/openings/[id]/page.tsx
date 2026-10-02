import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteOpeningAction } from "@/actions/admin-careers";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "@/components/dashboard/page-header";
import { OpeningForm } from "@/components/admin/opening-form";

export const metadata = { title: "Edit opening" };

export default async function EditOpeningPage({ params }: PageProps<"/admin/careers/openings/[id]">) {
  const { id } = await params;
  const opening = await db.jobOpening.findUnique({ where: { id } });
  if (!opening) notFound();
  return (
    <>
      <Link href="/admin/careers?tab=openings" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> All openings
      </Link>
      <PageHeader
        eyebrow="Careers"
        title={opening.title}
        actions={
          <form action={deleteOpeningAction}>
            <input type="hidden" name="id" value={opening.id} />
            <ConfirmSubmit size="sm">Delete opening</ConfirmSubmit>
          </form>
        }
      />
      <OpeningForm opening={opening} />
    </>
  );
}
