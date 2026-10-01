import type { Metadata } from "next";
import { Runner } from "@/components/brand/motion-marks";
import { LogoLink } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col overflow-hidden bg-ground">
      <div className="container-x py-5">
        <LogoLink />
      </div>
      <div className="container-x flex flex-1 flex-col justify-center pb-32">
        <p className="eyebrow mb-4">Error 404</p>
        <h1 className="display text-[clamp(5rem,16vw,15rem)] leading-[0.78]">It ran off.</h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-body">This page doesn&apos;t exist, or the leopard took it. Everything else is still here.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" size="lg" arrow>
            Back home
          </ButtonLink>
          <ButtonLink href="/shop" variant="outline" size="lg">
            Shop the drop
          </ButtonLink>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-24 border-t-2 border-ink">
        <Runner className="bottom-1 w-40" duration={5} />
      </div>
    </main>
  );
}
