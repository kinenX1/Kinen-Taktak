import Link from "next/link";
import { categories } from "@/config/shop";
import { siteConfig } from "@/config/site";
import { NMark } from "@/components/brand/logo";
import * as Icons from "@/components/ui/icons";

export function Footer() {
  const columns = [
    {
      title: "Shop",
      links: [{ label: "Everything", href: "/shop" }, ...categories.slice(0, 4).map((c) => ({ label: c.label, href: `/shop?category=${c.slug}` }))],
    },
    {
      title: "NovaWear",
      links: [
        { label: "About us", href: "/about" },
        { label: "How pre-orders work", href: "/about#pre-orders" },
        { label: `Contact — ${siteConfig.email}`, href: `mailto:${siteConfig.email}` },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Sign in", href: "/login" },
        { label: "Create an account", href: "/register" },
        { label: "My orders", href: "/account" },
        { label: "Bag", href: "/bag" },
      ],
    },
  ];
  return (
    <footer className="overflow-hidden bg-ink-2 text-bone">
      <div className="container-x grid gap-10 pt-16 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:pt-24">
        <div>
          <NMark className="w-16" color="var(--color-bone)" ground="var(--color-ink-2)" />
          <p className="mt-5 max-w-60 text-[0.9375rem] leading-relaxed text-fog">The sign of the N and the running leopard. {siteConfig.tagline}</p>
          <ul className="-ml-2.5 mt-4 flex gap-1">
            {siteConfig.socials.map((s) => {
              const Icon = Icons[s.icon];
              return (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noreferrer" aria-label={`NovaWear on ${s.label}`} className="flex size-11 items-center justify-center rounded-full hover:bg-bone/10">
                    <Icon size={21} />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="eyebrow text-leopard">{col.title}</h2>
            <ul className="mt-4 space-y-1">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-9 items-center break-all text-[0.9375rem] text-bone/90 hover:text-leopard">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="display text-outline-bone mt-12 whitespace-nowrap text-center text-[21vw] leading-[0.78]">
        NovaWear
      </div>
      <div className="container-x flex flex-wrap justify-between gap-3 py-6 font-mono text-xs tracking-[0.08em] text-fog-2">
        <span>© {new Date().getFullYear()} NovaWear</span>
        <span>{siteConfig.phone ?? siteConfig.hashtag}</span>
      </div>
    </footer>
  );
}
