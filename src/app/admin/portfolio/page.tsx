import Link from "next/link";
import { db } from "@/lib/db";
import { categoryLabel } from "@/config/portfolio";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Notice, PageHeader, Panel } from "@/components/dashboard/page-header";
import { ProjectVisual } from "@/components/visuals/project-visual";

export const metadata = { title: "Portfolio" };

export default async function AdminPortfolioPage({ searchParams }: PageProps<"/admin/portfolio">) {
  const sp = await searchParams;
  const projects = await db.portfolioProject.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  return (
    <>
      {sp.saved && <Notice tone="success">Project saved. The website has been updated.</Notice>}
      {sp.deleted && <Notice tone="success">Project deleted.</Notice>}
      <PageHeader
        eyebrow="Content"
        title="Portfolio"
        description="Projects shown on /work and the home page."
        actions={
          <ButtonLink href="/admin/portfolio/new" arrow>
            New project
          </ButtonLink>
        }
      />
      <Panel>
        <ul className="divide-y divide-line">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/portfolio/${p.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-fog-50/[0.03]">
                <ProjectVisual variant={p.visualVariant} accent={p.accent} title={p.title} coverImage={p.coverImage} className="aspect-[4/3] w-24 shrink-0 rounded-sm" sizes="96px" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="text-sm text-fog-500">
                    {categoryLabel[p.category]} · {p.year} · /work/{p.slug}
                  </span>
                </span>
                <span className="hidden flex-wrap justify-end gap-2 sm:flex">
                  {p.isDemo && <Badge>Concept</Badge>}
                  {p.featured && <Badge tone="accent">Featured</Badge>}
                  <Badge tone={p.published ? "success" : "neutral"}>{p.published ? "Published" : "Hidden"}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
