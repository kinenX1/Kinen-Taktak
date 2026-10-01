import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { Figure } from "@/components/brand/figure";
import { RunningMark } from "@/components/brand/motion-marks";
import { Marquee } from "@/components/motion/marquee";
import { Reveal } from "@/components/motion/reveal";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description: "NovaWear is built around one sign: an N with a leopard running through it.",
  alternates: { canonical: "/about" },
};

const values = [
  { title: "The sign", body: "Every piece carries the N and the running leopard. Speed, confidence, a little bit wild." },
  { title: "Made to order", body: "Pre-orders let us make what the pack actually wants, in the sizes you actually wear." },
  { title: "Worn by the pack", body: `Our lookbook is the people who wear it. Tag ${siteConfig.hashtag} and you could be next.` },
];

export default function AboutPage() {
  return (
    <>
      <section className="container-x pb-16 pt-10">
        <p className="eyebrow mb-4">About NovaWear</p>
        <h1 className="display overflow-hidden text-[clamp(5rem,15vw,15rem)] leading-[0.78]">
          <span className="letter">Born</span> <span className="letter [animation-delay:0.1s]">to</span>{" "}
          <span className="letter [animation-delay:0.2s]">run.</span>
        </h1>
        <div className="mt-12 flex flex-wrap items-center gap-[clamp(2rem,5vw,5rem)]">
          <Reveal className="relative flex aspect-square max-w-[560px] flex-[1_1_360px] items-center justify-center overflow-hidden rounded-md bg-ink">
            <div aria-hidden="true" className="print absolute inset-0 animate-drift opacity-[0.1] [--print-ink:var(--color-leopard)]" />
            <RunningMark ground="var(--color-ink)" color="var(--color-bone)" className="w-[62%]" />
          </Reveal>
          <div className="max-w-xl flex-[1_1_340px] space-y-5 text-lg leading-relaxed text-body">
            <p>
              NovaWear started with one sign: an <strong className="text-ink">N</strong> with a <strong className="text-ink">leopard running through it</strong>. It stands for
              moving fast, standing out and never waiting for permission.
            </p>
            <p>We make tees, pants, hoodies and pyjamas that carry that energy — clean shapes, heavy fabrics and the leopard hidden where you least expect it.</p>
            <p>
              Each drop opens with pre-orders. You lock your size and colour, we make the run, and you follow your order from your account until it&apos;s at
              your door.
            </p>
          </div>
        </div>
      </section>

      <div aria-hidden="true" className="print overflow-hidden bg-leopard py-4">
        <Marquee duration={30}>
          {["The N", "The leopard", "The pack"].map((t) => (
            <span key={t} className="display whitespace-nowrap bg-leopard px-6 text-[4rem] leading-none">
              {t} —
            </span>
          ))}
        </Marquee>
      </div>

      <section className="container-x py-[clamp(4rem,8vw,7rem)]" aria-labelledby="values-title">
        <h2 id="values-title" className="sr-only">
          What we stand for
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {values.map((v, i) => (
            <Reveal as="li" key={v.title} delay={i * 0.1} className="border-t-[3px] border-ink pt-5">
              <span className="display block text-[6rem] leading-[0.8] text-stone">0{i + 1}</span>
              <h3 className="mt-4 text-[1.375rem] font-extrabold">{v.title}</h3>
              <p className="mt-2 leading-relaxed text-body">{v.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="pre-orders" className="bg-ground-2" aria-labelledby="pre-title">
        <div className="container-x flex flex-wrap items-end justify-between gap-10 py-[clamp(4rem,8vw,7rem)]">
          <div className="max-w-2xl">
            <h2 id="pre-title" className="display text-[clamp(3.5rem,7vw,7rem)]">
              How pre-orders work
            </h2>
            <ul className="mt-8 space-y-4 text-lg leading-relaxed text-body">
              <li>
                <strong className="text-ink">1.</strong> Pick a piece marked <em>Pre-order</em>, choose your size and colour, and place your order.
              </li>
              <li>
                <strong className="text-ink">2.</strong> We call or message you to confirm. Nothing to pay until delivery.
              </li>
              <li>
                <strong className="text-ink">3.</strong> When the drop lands we ship it. Your account shows every step: received, confirmed, shipped, delivered.
              </li>
            </ul>
            <ButtonLink href="/shop?availability=pre-order" size="lg" arrow className="mt-9">
              See pre-order pieces
            </ButtonLink>
          </div>
          <div className="flex h-[clamp(280px,32vw,440px)] items-end" aria-hidden="true">
            <div className="h-[86%] animate-bob">
              <Figure look={{ skin: "#5C3B28", top: "#C9892E", pants: "#151514", long: true, hood: true, joggers: true }} />
            </div>
            <div className="-ml-4 h-full animate-bob [animation-delay:0.8s]">
              <Figure look={{ skin: "#E0B48F", top: "#151514", pants: "#5D6047", hair: true }} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
