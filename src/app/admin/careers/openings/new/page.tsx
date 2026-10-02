import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "@/components/dashboard/page-header";
import { OpeningForm } from "@/components/admin/opening-form";

export const metadata = { title: "New opening" };

export default function NewOpeningPage() {
  return (
    <>
      <Link href="/admin/careers?tab=openings" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> All openings
      </Link>
      <PageHeader eyebrow="Careers" title="New opening" />
      <OpeningForm />
    </>
  );
}
