import type { Metadata } from "next";
import Link from "next/link";
import { categories, categoryBySlug } from "@/config/shop";
import { getShopProducts } from "@/lib/data/products";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/shop/product-card";
import { Search } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  const { category } = await searchParams;
  const c = categoryBySlug(typeof category === "string" ? category : null);
  return {
    title: c ? c.label : "Shop",
    description: c ? `NovaWear ${c.label.toLowerCase()} — order now or pre-order your size.` : "Shop the NovaWear drop: tees, pants, hoodies and pyjamas.",
    alternates: { canonical: c ? `/shop?category=${c.slug}` : "/shop" },
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams;
  const category = categoryBySlug(typeof sp.category === "string" ? sp.category : null);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const preorderOnly = sp.availability === "pre-order";

  let products = await getShopProducts({ category: category?.value, q: q || undefined });
  if (preorderOnly) products = products.filter((p) => p.availability === "PRE_ORDER");

  const chips = [
    { label: "All", href: "/shop", active: !category && !preorderOnly },
    { label: "Pre-order", href: "/shop?availability=pre-order", active: preorderOnly },
    ...categories.map((c) => ({ label: c.label, href: `/shop?category=${c.slug}`, active: category?.value === c.value })),
  ];
  const title = preorderOnly ? "Pre-order" : (category?.label ?? "Shop");

  return (
    <div className="container-x pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-8">
        <div>
          <p className="eyebrow mb-3">
            {products.length} piece{products.length === 1 ? "" : "s"}
            {q && <> for “{q}”</>}
          </p>
          <h1 className="display overflow-hidden text-[clamp(4.5rem,12vw,12rem)] leading-[0.8]">
            <span key={title} className="letter">
              {title}
            </span>
          </h1>
        </div>
        <form id="search" role="search" action="/shop" className="flex w-full max-w-sm items-center gap-2 border-b-2 border-ink pb-1 focus-within:border-leopard sm:w-auto">
          {category && <input type="hidden" name="category" value={category.slug} />}
          <label htmlFor="shop-q" className="sr-only">
            Search the shop
          </label>
          <Search size={20} />
          <input id="shop-q" name="q" type="search" defaultValue={q} placeholder="Search hoodies, tees…" className="h-11 min-w-0 flex-1 bg-transparent text-base placeholder:text-stone focus:outline-none" />
        </form>
      </div>

      <nav aria-label="Categories" className="no-scrollbar -mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)]">
        <ul className="flex gap-2 py-6">
          {chips.map((chip) => (
            <li key={chip.href}>
              <Link
                href={chip.href}
                aria-current={chip.active ? "page" : undefined}
                className={cn(
                  "label inline-flex h-11 items-center whitespace-nowrap rounded-full border-2 border-ink px-4 text-xs transition-colors",
                  chip.active ? "bg-ink text-bone" : "hover:bg-ink hover:text-bone",
                )}
              >
                {chip.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {products.length === 0 ? (
        <div className="py-20 text-center">
          <p className="display text-6xl">Nothing here yet</p>
          <p className="mt-4 text-lg text-body">{q ? "Try another search." : "New pieces are on the way. Check back soon."}</p>
          <Link href="/shop" className="label mt-6 inline-flex min-h-11 items-center underline underline-offset-4">
            See everything
          </Link>
        </div>
      ) : (
        <ul className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => (
            <Reveal as="li" key={p.id} delay={(i % 4) * 0.06}>
              <ProductCard product={p} priority={i < 4} />
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
