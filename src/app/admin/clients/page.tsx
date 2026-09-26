import Link from "next/link";
import { searchClients } from "@/lib/data/admin";
import { formatDate, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Search, Users } from "@/components/ui/icons";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/page-header";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const clients = await searchClients(q || undefined);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Clients" description="Everyone with a MovEra account." />
      <form role="search" action="/admin/clients" className="relative mb-6 max-w-lg">
        <label htmlFor="q" className="sr-only">
          Search clients
        </label>
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fog-500" />
        <Input id="q" name="q" defaultValue={q} placeholder="Search by name, email or company" className="pl-11" />
      </form>
      <Panel>
        {clients.length ? (
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-fog-50/[0.03]">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-medium">{initials(c.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      {c.role === "ADMIN" && <Badge tone="accent">Admin</Badge>}
                    </span>
                    <span className="block truncate text-sm text-fog-500">
                      {c.email}
                      {c.company ? ` · ${c.company}` : ""}
                    </span>
                  </span>
                  <span className="hidden text-right text-sm sm:block">
                    <span className="block text-fog-200">{c._count.projectRequests} requests</span>
                    <span className="block text-xs text-fog-500">Joined {formatDate(c.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Users size={20} />} title="No clients found" />
        )}
      </Panel>
    </>
  );
}
