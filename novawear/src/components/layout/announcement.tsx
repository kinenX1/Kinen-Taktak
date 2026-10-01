import { siteConfig } from "@/config/site";
import { Marquee } from "@/components/motion/marquee";

export function Announcement() {
  return (
    <div className="bg-ink py-2.5 font-mono text-xs uppercase tracking-[0.14em] text-bone">
      <p className="sr-only">{siteConfig.announcements.join(". ")}</p>
      <Marquee duration={42}>
        {siteConfig.announcements.map((text) => (
          <span key={text} className="flex items-center gap-7 whitespace-nowrap pr-7">
            {text}
            <span className="size-1.5 rounded-full bg-leopard" />
          </span>
        ))}
      </Marquee>
    </div>
  );
}
