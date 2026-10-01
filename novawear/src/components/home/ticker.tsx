import { Marquee } from "@/components/motion/marquee";

const words = ["T-Shirts", "Pants", "Hoodies", "Pyjamas", "Drop 01"];

/** Two bands crossing in opposite directions: leopard print over ink. */
export function Ticker() {
  return (
    <section aria-label="Tees, pants, hoodies, pyjamas" className="relative h-[230px] overflow-hidden">
      <div className="print absolute -inset-x-[5%] top-[34px] -rotate-3 bg-leopard py-3.5">
        <Marquee duration={26}>
          {words.map((w) => (
            <span key={w} className="display whitespace-nowrap bg-leopard px-6 text-[3.5rem] leading-none">
              {w} —
            </span>
          ))}
        </Marquee>
      </div>
      <div className="absolute -inset-x-[5%] top-[108px] rotate-2 bg-ink py-3.5">
        <Marquee duration={34} reverse>
          {words.map((w) => (
            <span key={w} className="display text-outline-bone whitespace-nowrap px-6 text-[3.5rem] leading-none">
              {w} —
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
