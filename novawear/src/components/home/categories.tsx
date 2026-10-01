import Link from "next/link";
import type { Category } from "@prisma/client";
import { categories } from "@/config/shop";
import { Figure, type FigureLook } from "@/components/brand/figure";
import { Reveal } from "@/components/motion/reveal";
import { ArrowUpRight } from "@/components/ui/icons";

const looks: Partial<Record<Category, FigureLook>> = {
  TSHIRT: { skin: "#6E4630", top: "#ECE8DF", pants: "#151514", hair: true },
  PANTS: { skin: "#C99872", top: "#151514", pants: "#5D6047", hair: true, joggers: true },
  HOODIE: { skin: "#3B2A20", top: "#C9892E", pants: "#151514", long: true, hood: true },
  PYJAMA: { skin: "#5C3B28", top: "#4B3427", pants: "#4B3427", long: true, pyjama: true },
  SHORTS: { skin: "#A8714F", top: "#9C9B97", pants: "#151514", hair: true },
  JACKET: { skin: "#E0B48F", top: "#1F2738", pants: "#B9A487", long: true, hair: true },
};

export function Categories({ counts }: { counts: Partial<Record<Category, number>> }) {
  // Show the four core lines, plus any other category that has pieces.
  const shown = categories.filter((c, i) => i < 4 || (counts[c.value] ?? 0) > 0);
  return (
    <section id="categories" aria-labelledby="cat-title" className="container-x py-[clamp(3rem,6vw,6rem)]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <h2 id="cat-title" className="display text-[clamp(3.75rem,8vw,8rem)]">
          Pick your
          <br />
          category
        </h2>
        <p className="eyebrow max-w-xs leading-relaxed">Every line. One sign. Every piece in your size and your colour.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((c, i) => {
          const count = counts[c.value] ?? 0;
          return (
            <Reveal as="li" key={c.value} delay={i * 0.08}>
              <Link
                href={`/shop?category=${c.slug}`}
                className="group relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-md bg-ground-2 p-5 transition-colors duration-500 hover:bg-ink hover:text-bone"
              >
                <span className="relative z-10 flex justify-between font-mono text-xs uppercase tracking-[0.12em]">
                  <span>0{i + 1}</span>
                  <span>
                    {count} piece{count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="absolute inset-x-0 bottom-[84px] flex h-[min(320px,62%)] justify-center transition-transform duration-700 ease-(--ease-snap) group-hover:-translate-y-2 group-hover:scale-[1.06]">
                  <Figure look={looks[c.value]!} />
                </span>
                <span className="relative z-10 flex items-end justify-between gap-3">
                  <span className="display text-[clamp(2.9rem,4.4vw,4.25rem)]">{c.label}</span>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-current transition-transform duration-500 group-hover:rotate-45">
                    <ArrowUpRight size={19} />
                  </span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
