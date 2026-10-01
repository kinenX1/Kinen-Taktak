import { LogoLink } from "@/components/brand/logo";
import { RunningMark } from "@/components/brand/motion-marks";
import { Figure } from "@/components/brand/figure";

/** Split screen: the brand in motion on the left, the form on the right. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-ground">
      <div className="relative flex min-h-[360px] flex-[1_1_420px] flex-col justify-between overflow-hidden bg-ink-2 p-[clamp(1.5rem,4vw,3.5rem)] text-bone">
        <div aria-hidden="true" className="print absolute inset-0 animate-drift opacity-[0.08] [--print-ink:var(--color-leopard)]" />
        <LogoLink ground="var(--color-ink-2)" className="relative" />
        <div className="relative flex items-end justify-center gap-6 py-8">
          <RunningMark ground="var(--color-ink-2)" color="var(--color-bone)" className="w-[min(300px,55%)]" />
          <div aria-hidden="true" className="hidden h-[clamp(200px,24vw,320px)] animate-bob xl:block">
            <Figure look={{ skin: "#8A5A3C", top: "#C9892E", pants: "#151514", long: true, hood: true, joggers: true }} />
          </div>
        </div>
        <div className="relative">
          <p className="display text-[clamp(3.5rem,6vw,6rem)]">
            Welcome to
            <br />
            the pack
          </p>
          <p className="mt-3.5 max-w-sm text-base leading-relaxed text-fog">Save your details, check out faster and follow every order and pre-order.</p>
        </div>
      </div>
      <main id="main" tabIndex={-1} className="flex flex-[1_1_480px] flex-col justify-center p-[clamp(1.5rem,5vw,4.5rem)] outline-none">
        <div className="mx-auto w-full max-w-[460px]">{children}</div>
      </main>
    </div>
  );
}
