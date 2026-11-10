import Image from "next/image";

/**
 * The hero figure. HeroXRay renders the same frame with the X-ray version of
 * the image inside its lens, so both must share SPEEDSTER_FRAME exactly.
 */
export const SPEEDSTER_FRAME =
  "speedster-frame absolute bottom-0 right-1/2 h-full aspect-square max-w-none translate-x-1/2 lg:right-0 lg:translate-x-0";

export function HeroSpeedster({ xray = false }: { xray?: boolean }) {
  return (
    <div aria-hidden="true" className={`${SPEEDSTER_FRAME} ${xray ? "" : "opacity-45 lg:opacity-100"}`}>
      <Image
        src={xray ? "/hero/speedster-xray.webp" : "/hero/speedster.webp"}
        alt=""
        fill
        sizes="(min-width: 1024px) 100vh, 100vw"
        preload={!xray}
        className="object-cover"
      />
    </div>
  );
}
