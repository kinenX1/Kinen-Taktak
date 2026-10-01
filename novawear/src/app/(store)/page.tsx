import { db } from "@/lib/db";
import { getCategoryCounts, getFeaturedProducts, productCardSelect } from "@/lib/data/products";
import { Categories } from "@/components/home/categories";
import { Drop } from "@/components/home/drop";
import { Hero } from "@/components/home/hero";
import { Lookbook } from "@/components/home/lookbook";
import { Newsletter } from "@/components/home/newsletter";
import { Spotlight } from "@/components/home/spotlight";
import { AboutTeaser, Steps } from "@/components/home/story";
import { Ticker } from "@/components/home/ticker";

// Always show the latest catalogue straight after an admin edit.
export const dynamic = "force-dynamic";

async function getSpotlight() {
  const pick = await db.product.findFirst({
    where: { published: true, featured: true, category: "HOODIE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  const fallback = pick ?? (await db.product.findFirst({ where: { published: true }, orderBy: [{ sortOrder: "asc" }], select: { id: true } }));
  if (!fallback) return null;
  return db.product.findUnique({ where: { id: fallback.id }, select: { ...productCardSelect, description: true } });
}

export default async function HomePage() {
  const [products, counts, spotlight] = await Promise.all([getFeaturedProducts(8), getCategoryCounts(), getSpotlight()]);
  return (
    <>
      <Hero />
      <Ticker />
      <Categories counts={counts} />
      <Drop products={products} />
      {spotlight && spotlight.colors.length > 0 && spotlight.sizes.length > 0 && <Spotlight product={spotlight} />}
      <Lookbook />
      <Steps />
      <AboutTeaser />
      <Newsletter />
    </>
  );
}
