import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "@/components/dashboard/page-header";
import { ServiceForm } from "@/components/admin/service-form";

export const metadata = { title: "Edit service" };

export default async function EditServicePage({ params }: PageProps<"/admin/services/[id]">) {
  const { id } = await params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) notFound();
  return (
    <>
      <Link href="/admin/services" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Services
      </Link>
      <PageHeader eyebrow="Content" title={service.title} />
      <ServiceForm service={service} />
    </>
  );
}
