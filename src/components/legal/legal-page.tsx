import { SectionLabel } from "@/components/ui/section-label";
import { siteConfig } from "@/config/site";
import { fmt } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

type Doc = Dictionary["legal"]["privacy"];

/**
 * Layout for legal documents. Content is structured as sections in the
 * dictionaries so real, lawyer-reviewed text can be dropped into each one.
 */
export function LegalPage({ doc, t }: { doc: Doc; t: Dictionary["legal"] }) {
  const vars = { name: siteConfig.name, email: siteConfig.email };
  return (
    <div className="container-x pt-[calc(var(--nav-height)+4rem)] pb-24 md:pt-[calc(var(--nav-height)+6rem)] md:pb-36">
      <SectionLabel className="mb-8">{t.label}</SectionLabel>
      <h1 className="text-display-lg font-medium">{doc.title}</h1>
      <p className="mt-4 font-mono text-xs text-fog-500">{fmt(t.updated, { date: t.date })}</p>

      <div role="note" className="mt-10 max-w-3xl rounded-md border border-warning/30 bg-warning/[0.06] px-5 py-4 text-sm leading-relaxed text-warning">
        {t.placeholder}
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-12">
        <nav aria-label={t.onThisPage} className="lg:col-span-3">
          <ol className="space-y-2 text-sm lg:sticky lg:top-28">
            {doc.sections.map((s, i) => (
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
          <p className="text-lg leading-relaxed text-fog-200">{fmt(doc.intro, vars)}</p>
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 border-t border-line pt-8">
              <h2 className="text-2xl font-medium tracking-[-0.03em]">
                <span className="mr-3 font-mono text-sm text-flux">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="mt-4 space-y-4 leading-relaxed text-fog-400">
                {s.paragraphs.map((p) => (
                  <p key={p}>{fmt(p, vars)}</p>
                ))}
                {s.items.length > 0 && (
                  <ul className="space-y-2">
                    {s.items.map((item) => (
                      <li key={item} className="ml-5 list-disc">
                        {fmt(item, vars)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
