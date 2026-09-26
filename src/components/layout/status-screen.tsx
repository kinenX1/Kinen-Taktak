import type { ReactNode } from "react";
import { WordmarkLink } from "./wordmark";
import { AmbientField } from "./ambient-field";

/** Full-screen layout for 404 / error states. */
export function StatusScreen({ code, title, children, actions }: { code: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="grain relative isolate flex min-h-dvh flex-col overflow-hidden">
      <AmbientField />
      <header className="container-x flex h-(--nav-height) items-center">
        <WordmarkLink />
      </header>
      <main id="main" className="container-x flex flex-1 flex-col justify-center pb-20">
        <p aria-hidden="true" className="select-none text-[clamp(7rem,30vw,26rem)] font-medium leading-[0.8] tracking-[-0.08em] text-fog-50/[0.06]">
          {code}
        </p>
        <h1 className="-mt-[0.3em] max-w-4xl text-display-lg font-medium">{title}</h1>
        {children && <div className="mt-6 max-w-lg text-lg leading-relaxed text-fog-400">{children}</div>}
        {actions && <div className="mt-10 flex flex-wrap gap-3">{actions}</div>}
      </main>
    </div>
  );
}
