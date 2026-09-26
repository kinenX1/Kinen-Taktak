import { Marquee } from "@/components/motion/marquee";

const items = ["Websites", "Web Apps", "Mobile Apps", "UI/UX Design", "Custom Software", "E-commerce", "SaaS", "Automation", "AI Products"];

export function CapabilityMarquee() {
  return (
    <section aria-label="Capabilities" className="relative border-y border-line py-6 md:py-8">
      <p className="sr-only">{items.join(", ")}</p>
      <Marquee duration={55}>
        {items.map((item, i) => (
          <span key={item} className="flex items-center">
            <span
              className={
                i % 2
                  ? "text-outline px-6 text-[clamp(2.5rem,6vw,5.5rem)] font-medium leading-none tracking-[-0.05em] md:px-10"
                  : "px-6 text-[clamp(2.5rem,6vw,5.5rem)] font-medium leading-none tracking-[-0.05em] text-fog-50 md:px-10"
              }
            >
              {item}
            </span>
            <svg viewBox="0 0 28 20" className="h-6 w-auto text-flux md:h-8" aria-hidden="true">
              <path d="M16 18 21 2h5l-5 16z" fill="currentColor" />
            </svg>
          </span>
        ))}
      </Marquee>
    </section>
  );
}
