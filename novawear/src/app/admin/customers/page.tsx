import { requireAdmin } from "@/lib/auth/dal";
import { getCustomers, getSubscribers } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireAdmin();
  const [customers, subscribers] = await Promise.all([getCustomers(), getSubscribers()]);
  return (
    <>
      <AdminHeader eyebrow={`${customers.length} accounts`} title="Customers">
        Everyone with a NovaWear account, plus newsletter sign-ups. To make someone an admin, run <code className="font-mono text-sm">npm run make-admin -- their@email.com</code>.
      </AdminHeader>
      <div className="overflow-x-auto bg-paper">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left font-mono text-2xs uppercase tracking-[0.1em] text-muted">
              <th scope="col" className="px-5 py-3 font-medium">Name</th>
              <th scope="col" className="px-3 py-3 font-medium">Email</th>
              <th scope="col" className="px-3 py-3 font-medium">Phone</th>
              <th scope="col" className="px-3 py-3 font-medium">Orders</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-5 py-3 font-semibold">
                  {c.name} {c.role === "ADMIN" && <Badge tone="leopard" className="ml-1.5">Admin</Badge>}
                </td>
                <td className="break-all px-3 py-3">
                  <a href={`mailto:${c.email}`} className="underline-offset-4 hover:underline">
                    {c.email}
                  </a>
                </td>
                <td className="px-3 py-3">{c.phone ?? "—"}</td>
                <td className="px-3 py-3 font-mono">{c._count.orders}</td>
                <td className="px-5 py-3 text-right font-mono text-xs text-muted">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="subs-title" className="mt-10">
        <h2 id="subs-title" className="display mb-3 text-3xl">
          Newsletter ({subscribers.length})
        </h2>
        {subscribers.length === 0 ? (
          <p className="bg-paper px-5 py-6 text-body">No sign-ups yet.</p>
        ) : (
          <ul className="grid gap-px bg-line sm:grid-cols-2">
            {subscribers.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 bg-paper px-5 py-3 text-sm">
                <span className="break-all">{s.email}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{formatDate(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
