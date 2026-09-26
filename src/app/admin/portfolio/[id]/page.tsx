import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePortfolioProjectAction } from "@/actions/admin";
import { db } from "@/lib/db";
import { ArrowLeft, ArrowUpRight } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { PageHeader } from "@/components/dashboard/page-header";
import { PortfolioForm } from "@/components/admin/portfolio-form";

export const metadata = { title: "Edit project" };

export default async function EditPortfolioProjectPage({ params }: PageProps<"/admin/portfolio/[id]">) {
  const { id } = await params;
  const project = await db.portfolioProject.findUnique({ where: { id } });
  if (!project) notFound();
  return (
    <>
      <Link href="/admin/portfolio" className="group mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 hover:text-fog-50">
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Portfolio
      </Link>
      <PageHeader
        eyebrow="Content"
        title={project.title}
        actions={
          <>
            <Link href={`/work/${project.slug}`} target="_blank" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              View <ArrowUpRight size={14} />
            </Link>
            <form action={deletePortfolioProjectAction}>
              <input type="hidden" name="id" value={project.id} />
              <ConfirmSubmit size="sm">Delete</ConfirmSubmit>
            </form>
          </>
        }
      />
      <PortfolioForm project={project} />
    </>
  );
}
