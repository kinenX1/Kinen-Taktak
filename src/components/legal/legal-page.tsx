import type { ReactNode } from "react";
import { SectionLabel } from "@/components/ui/section-label";

export type LegalSection = { id: string; title: string; body: ReactNode };

/**
 * Layout for legal documents. Content is structured as sections so real,
 * lawyer-reviewed text can be dropped into each one.
 */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="container-x pt-[calc(var(--nav-height)+4rem)] pb-24 md:pt-[calc(var(--nav-height)+6rem)] md:pb-36">
      <SectionLabel className="mb-8">Legal</SectionLabel>
      <h1 className="text-display-lg font-medium">{title}</h1>
      <p className="mt-4 font-mono text-xs text-fog-500">Last updated: {updated}</p>

      <div role="note" className="mt-10 max-w-3xl rounded-md border border-warning/30 bg-warning/[0.06] px-5 py-4 text-sm leading-relaxed text-warning">
        Placeholder text. This document must be reviewed and replaced by a qualified legal professional before launch.
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-12">
        <nav aria-label="On this page" className="lg:col-span-3">
          <ol className="space-y-2 text-sm lg:sticky lg:top-28">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex gap-3 text-fog-400 transition-colors hover:text-fog-50">
                  <span className="font-mono text-2xs text-fog-500">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="max-w-3xl space-y-12 lg:col-span-9">
          <div className="text-lg leading-relaxed text-fog-200">{intro}</div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-line pt-8">
              <h2 className="text-2xl font-medium tracking-[-0.03em]">
                <span className="mr-3 font-mono text-sm text-flux">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="mt-4 space-y-4 leading-relaxed text-fog-400 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
