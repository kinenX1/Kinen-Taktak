import { RunningMark } from "@/components/brand/motion-marks";
import { Reveal } from "@/components/motion/reveal";
import { ButtonLink } from "@/components/ui/button";

const steps = [
  { title: "Pick it", body: "Choose your piece, your colour and your size. Every product page shows what's in stock and what's on pre-order." },
  { title: "Order or reserve it", body: "In stock? Order it now. Coming soon? Pre-order and lock your size before the drop sells out." },
  { title: "Track it", body: "Follow every order from your account: received, confirmed, shipped, delivered. Pay on delivery." },
];

export function Steps() {
  return (
    <section aria-labelledby="steps-title" className="container-x py-[clamp(4rem,8vw,7.5rem)]">
      <h2 id="steps-title" className="display mb-10 text-[clamp(3.75rem,8vw,8rem)]">
        Order now.
        <br />
        Or pre-order.
      </h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 0.1} className="border-t-[3px] border-ink pt-5">
            <span className="display block text-[6rem] leading-[0.8] text-stone">0{i + 1}</span>
            <h3 className="mt-4 text-[1.375rem] font-extrabold">{s.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-body">{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function AboutTeaser() {
  return (
    <section aria-labelledby="about-title" className="container-x flex flex-wrap items-center gap-[clamp(2rem,5vw,5rem)] pb-[clamp(4rem,8vw,7.5rem)]">
      <Reveal className="relative flex aspect-square max-w-[620px] flex-[1_1_380px] items-center justify-center overflow-hidden rounded-md bg-ground-2">
        <div aria-hidden="true" className="print absolute inset-0 animate-drift opacity-[0.08]" />
        <RunningMark ground="var(--color-ground-2)" className="w-[62%]" />
      </Reveal>
      <div className="max-w-xl flex-[1_1_340px]">
        <p className="eyebrow mb-3.5">About NovaWear</p>
        <h2 id="about-title" className="display text-[clamp(4rem,8vw,8.25rem)] leading-[0.82]">
          Born
          <br />
          to run.
        </h2>
        <p className="mt-7 text-lg leading-relaxed text-body">
          NovaWear started with one sign: an N with a leopard running through it. Speed, confidence and a little bit wild — that&apos;s the energy behind every tee, pant, hoodie and pyjama set.
        </p>
        <ButtonLink href="/about" variant="outline" size="lg" arrow className="mt-8">
          Our story
        </ButtonLink>
      </div>
    </section>
  );
}
