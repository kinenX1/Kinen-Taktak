import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Figure, type FigureLook } from "@/components/brand/figure";
import { Marquee } from "@/components/motion/marquee";
import { Reveal } from "@/components/motion/reveal";

const looks: (FigureLook & { n: string; items: string; href: string; bob: number })[] = [
  { n: "01", items: "Prowl Hoodie / Prowl Track Pant", href: "/shop/prowl-hoodie", skin: "#3B2A20", top: "#151514", pants: "#151514", long: true, hood: true, joggers: true, bob: 0 },
  { n: "02", items: "N-Logo Heavy Tee / Cargo Pant 01", href: "/shop/n-logo-heavy-tee", skin: "#E0B48F", top: "#ECE8DF", pants: "#5D6047", hair: true, bob: 0.7 },
  { n: "03", items: "Night Prowl Pyjama Set", href: "/shop/night-prowl-pyjama-set", skin: "#8A5A3C", top: "#4B3427", pants: "#4B3427", long: true, pyjama: true, hair: true, bob: 1.4 },
  { n: "04", items: "Prowl Hoodie in Leopard", href: "/shop/prowl-hoodie", skin: "#6E4630", top: "#C9892E", pants: "#151514", long: true, hood: true, joggers: true, bob: 0.35 },
  { n: "05", items: "Leopard Run Tee / Prowl Track Pant", href: "/shop/leopard-run-tee", skin: "#C99872", top: "#5D6047", pants: "#9C9B97", hair: true, joggers: true, bob: 1.05 },
];

export function Lookbook() {
  return (
    <section id="lookbook" aria-labelledby="look-title" className="relative overflow-hidden bg-ink-2 text-bone">
      <div aria-hidden="true" className="print absolute inset-0 animate-drift opacity-[0.07] [--print-ink:var(--color-leopard)]" />
      <div className="container-x relative py-[clamp(4rem,8vw,7.5rem)]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-3 text-leopard">Lookbook — Drop 01</p>
            <h2 id="look-title" className="display text-[clamp(5rem,12vw,12.5rem)] leading-[0.78]">
              The pack
            </h2>
          </div>
          <p className="max-w-sm text-[1.0625rem] leading-relaxed text-fog">
            Real people, real fits. Tag <strong className="text-bone">{siteConfig.hashtag}</strong> and get featured on the next drop page.
          </p>
        </div>
        <ul className="no-scrollbar -mx-[var(--gutter)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--gutter)] pb-4 pt-3">
          {looks.map((look, i) => (
            <Reveal as="li" key={look.n} delay={i * 0.08} className="w-[clamp(240px,24vw,320px)] flex-none snap-start">
              <figure className="group transition-transform duration-500 ease-(--ease-snap) hover:-translate-y-2.5">
                <div className="relative flex aspect-[3/4] items-end justify-center overflow-hidden rounded-md bg-ground-2 pb-4">
                  <span className="absolute left-3.5 top-3.5 font-mono text-2xs font-bold uppercase tracking-[0.14em] text-ink">Look {look.n}</span>
                  <div className="h-[86%] transition-transform duration-700 group-hover:scale-105">
                    <div className="h-full animate-bob" style={{ animationDelay: `${look.bob}s` }}>
                      <Figure look={look} label={`Look ${look.n}: ${look.items}`} />
                    </div>
                  </div>
                </div>
                <figcaption className="flex items-center justify-between gap-3 pt-3 text-sm leading-snug text-fog">
                  <span>{look.items}</span>
                  <Link href={look.href} className="label flex min-h-11 shrink-0 items-center text-xs text-leopard hover:underline">
                    Shop look
                  </Link>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
      <div aria-hidden="true" className="border-t border-line-dark py-5">
        <Marquee duration={38}>
          {["Run with the pack", siteConfig.hashtag, "NovaWear"].map((t) => (
            <span key={t} className="display text-outline-bone whitespace-nowrap px-8 text-[4.5rem] leading-none">
              {t}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
