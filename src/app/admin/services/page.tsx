import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ServiceGlyph } from "@/components/visuals/service-glyph";

export const metadata = { title: "Services" };

export default async function AdminServicesPage() {
  const services = await db.service.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader eyebrow="Content" title="Services" description="Copy shown on /services and the home page." />
      <Panel>
        <ul className="divide-y divide-line">
          {services.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/services/${s.id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-fog-50/[0.03]">
                <span className="size-10 shrink-0">
                  <ServiceGlyph slug={s.slug} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <span className="block truncate text-sm text-fog-500">{s.tagline}</span>
                </span>
                <Badge tone={s.published ? "success" : "neutral"}>{s.published ? "Published" : "Hidden"}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
