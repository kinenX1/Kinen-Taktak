import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "@/components/dashboard/page-header";
import { PortfolioForm } from "@/components/admin/portfolio-form";

export const metadata = { title: "New portfolio project" };

export default function NewPortfolioProjectPage() {
  return (
    <>
      <Link href="/admin/portfolio" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Portfolio
      </Link>
      <PageHeader eyebrow="Content" title="New project" />
      <PortfolioForm />
    </>
  );
}
