import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { getAdjacentProject, getProjectBySlug } from "@/lib/data/content";
import { fmt } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowUpRight } from "@/components/ui/icons";
import { SectionLabel } from "@/components/ui/section-label";
import { Reveal } from "@/components/motion/reveal";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Parallax } from "@/components/motion/parallax";
import { ProjectVisual } from "@/components/visuals/project-visual";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd } from "@/components/seo/json-ld";
import { siteConfig } from "@/config/site";

export async function generateMetadata({ params }: PageProps<"/work/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { locale, t } = await getI18n();
  const project = await getProjectBySlug(locale, slug);
  if (!project) return { title: t.meta.projectNotFound };
  return {
    title: `${project.title} — ${t.options.categories[project.category]}`,
    description: project.summary,
    alternates: { canonical: `/work/${project.slug}` },
    openGraph: {
      url: `/work/${project.slug}`,
      title: `${project.title} — MovEra`,
      description: project.summary,
      ...(project.coverImage ? { images: [project.coverImage] } : {}),
    },
  };
}

const isDirectVideo = (url: string) => /\.(mp4|webm)(\?.*)?$/i.test(url);

export default async function ProjectPage({ params }: PageProps<"/work/[slug]">) {
  const { slug } = await params;
  const { locale, t } = await getI18n();
  const project = await getProjectBySlug(locale, slug);
  if (!project) notFound();
  const next = await getAdjacentProject(locale, slug);
  const tp = t.project;
  const categoryLabel = t.options.categories;

  const meta = [
    { k: tp.client, v: project.client },
    { k: tp.category, v: categoryLabel[project.category] },
    { k: tp.year, v: String(project.year) },
    { k: tp.stack, v: project.technologies.slice(0, 3).join(", ") },
  ];

  return (
    <article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: project.title,
          description: project.summary,
          url: `${siteConfig.url}/work/${project.slug}`,
          creator: { "@type": "Organization", name: siteConfig.name },
          dateCreated: String(project.year),
        }}
      />

      {/* ── Hero ───────────────────────────── */}
      <header className="relative pt-[calc(var(--nav-height)+2.5rem)] md:pt-[calc(var(--nav-height)+4rem)]">
        <div className="container-x">
          <Link
            href="/work"
            transitionTypes={["nav-back"]}
            className="group mb-10 inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 transition-colors hover:text-fog-50"
          >
            <ArrowLeft size={16} className="transition-transform duration-500 group-hover:-translate-x-1" />
            {tp.allWork}
          </Link>
          <p className="eyebrow mb-6 flex flex-wrap items-center gap-3">
            <span className="text-flux">{categoryLabel[project.category]}</span>
            <span aria-hidden="true">·</span>
            <span>{project.year}</span>
            {project.isDemo && <Badge>{t.common.conceptProject}</Badge>}
          </p>
          <h1 className="text-display-2xl font-medium">
            <SplitReveal immediate lines={[project.title]} />
          </h1>
          <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-12">
            <Reveal delay={0.4} className="md:col-span-6">
              <p className="text-lead text-fog-200">{project.summary}</p>
            </Reveal>
            <Reveal delay={0.5} className="md:col-span-5 md:col-start-8">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6">
                {meta.map((m) => (
                  <div key={m.k}>
                    <dt className="eyebrow">{m.k}</dt>
                    <dd className="mt-1.5 text-sm text-fog-50">{m.v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
        <div className="container-x mt-14 md:mt-20">
          <ViewTransition name={`project-${project.slug}`} share="morph" default="none">
            <ProjectVisual
              variant={project.visualVariant}
              accent={project.accent}
              title={project.title}
              coverImage={project.coverImage}
              priority
              sizes="100vw"
              className="aspect-[4/3] w-full rounded-xl md:aspect-[16/8]"
            />
          </ViewTransition>
        </div>
      </header>

      {project.isDemo && (
        <div className="container-x mt-8">
          <p className="rounded-md border border-line bg-ink-900 px-5 py-4 text-sm leading-relaxed text-fog-400">
            <strong className="font-medium text-fog-200">{tp.aboutLabel}</strong> {fmt(tp.aboutText, { title: project.title })}
          </p>
        </div>
      )}

      {/* ── Overview ───────────────────────── */}
      <StorySection label={tp.overview} index="01">
        <p className="text-[clamp(1.5rem,2.8vw,2.5rem)] font-medium leading-[1.2] tracking-[-0.03em] text-fog-50">{project.overview}</p>
      </StorySection>

      {/* ── Challenge / Solution ───────────── */}
      <section className="border-y border-line bg-ink-900/50">
        <div className="container-x grid md:grid-cols-2">
          {[
            { k: tp.challenge, v: project.challenge, n: "02" },
            { k: tp.solution, v: project.solution, n: "03" },
          ].map((b, i) => (
            <Reveal
              key={b.k}
              delay={i * 0.1}
              className={i === 0 ? "border-line py-16 md:border-r md:py-24 md:pr-12" : "border-t border-line py-16 md:border-t-0 md:py-24 md:pl-12"}
            >
              <SectionLabel index={b.n}>{b.k}</SectionLabel>
              <p className="mt-8 text-lg leading-relaxed text-fog-200 md:text-xl">{b.v}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Design ─────────────────────────── */}
      <StorySection label={tp.design} index="04">
        <p className="text-lg leading-relaxed text-fog-200 md:text-xl">{project.design}</p>
      </StorySection>
      <div className="container-x grid gap-6 md:grid-cols-12">
        <Parallax offset={30} className="md:col-span-7">
          <DetailFrame project={project} label={fmt(tp.detail, { title: project.title })} origin="18% 22%" />
        </Parallax>
        <Parallax offset={70} className="md:col-span-5 md:mt-24">
          <DetailFrame project={project} label={fmt(tp.detail, { title: project.title })} origin="72% 50%" tall />
        </Parallax>
      </div>

      {/* ── Development ────────────────────── */}
      <StorySection label={tp.development} index="05">
        <p className="text-lg leading-relaxed text-fog-200 md:text-xl">{project.development}</p>
        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-3" aria-label={t.work.technologies}>
          {project.technologies.map((t) => (
            <li key={t} className="flex items-center gap-2 text-2xl font-medium tracking-[-0.03em] text-fog-50 md:text-3xl">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-flux" />
              {t}
            </li>
          ))}
        </ul>
      </StorySection>

      {/* ── Gallery & video (when provided) ── */}
      {project.gallery.length > 0 && (
        <section aria-label={tp.gallery} className="container-x grid gap-6 pb-24 md:grid-cols-2">
          {project.gallery.map((src, i) => (
            <Reveal key={src} className={i % 3 === 0 ? "md:col-span-2" : undefined}>
              <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-ink-800">
                <Image
                  src={src}
                  alt={fmt(tp.imageAlt, { title: project.title, n: i + 1 })}
                  fill
                  sizes={i % 3 === 0 ? "100vw" : "50vw"}
                  unoptimized={src.startsWith("http")}
                  className="object-cover"
                />
              </div>
            </Reveal>
          ))}
        </section>
      )}
      {project.videoUrl && (
        <section aria-label={tp.video} className="container-x pb-24">
          {isDirectVideo(project.videoUrl) ? (
            <video src={project.videoUrl} controls playsInline preload="metadata" className="w-full rounded-lg bg-ink-800" />
          ) : (
            <a href={project.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-fog-50 underline-offset-4 hover:underline">
              {tp.watchVideo} <ArrowUpRight size={16} />
            </a>
          )}
        </section>
      )}

      {/* ── Results ────────────────────────── */}
      {project.results.length > 0 && (
        <StorySection label={project.isDemo ? tp.delivered : tp.results} index="06">
          <ol className="divide-y divide-line border-y border-line">
            {project.results.map((r, i) => (
              <li key={r} className="flex items-baseline gap-6 py-6">
                <span className="font-mono text-xs text-flux">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-xl font-medium tracking-[-0.02em] text-fog-50 md:text-2xl">{r}</span>
              </li>
            ))}
          </ol>
        </StorySection>
      )}

      {/* ── Next project ───────────────────── */}
      {next && (
        <section aria-label={tp.next} className="border-t border-line">
          <Link
            href={`/work/${next.slug}`}
            transitionTypes={["nav-forward"]}
            className="group container-x flex flex-col gap-6 py-20 md:flex-row md:items-end md:justify-between md:py-28"
          >
            <div>
              <p className="eyebrow mb-4">{fmt(tp.nextLabel, { category: categoryLabel[next.category] })}</p>
              <p className="text-display-xl font-medium transition-colors duration-700" style={{ ["--a" as string]: next.accent }}>
                <span className="bg-[linear-gradient(var(--a),var(--a))] bg-[length:0%_0.06em] bg-left-bottom bg-no-repeat transition-[background-size] duration-700 ease-(--ease-out-expo) group-hover:bg-[length:100%_0.06em]">
                  {next.title}
                </span>
              </p>
            </div>
            <span className="flex size-20 shrink-0 items-center justify-center rounded-full border border-line-strong transition-all duration-700 ease-(--ease-out-expo) group-hover:rotate-45 group-hover:border-flux group-hover:bg-flux group-hover:text-ink-950 md:size-28">
              <ArrowUpRight size={30} />
            </span>
          </Link>
        </section>
      )}

      <FinalCta title={[tp.ctaTitle1, tp.ctaTitle2]} />
    </article>
  );
}

function StorySection({ label, index, children }: { label: string; index: string; children: React.ReactNode }) {
  return (
    <section className="container-x grid gap-8 py-20 md:grid-cols-12 md:py-28">
      <div className="md:col-span-4">
        <div className="md:sticky md:top-28">
          <SectionLabel index={index}>{label}</SectionLabel>
        </div>
      </div>
      <Reveal className="md:col-span-8">{children}</Reveal>
    </section>
  );
}

/** A cropped, zoomed view of the cover art — reads as a detail shot. */
function DetailFrame({
  project,
  label,
  origin,
  tall,
}: {
  project: { visualVariant: import("@prisma/client").VisualVariant; accent: string };
  label: string;
  origin: string;
  tall?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line ${tall ? "aspect-[4/5]" : "aspect-[4/3]"}`}>
      <div className="absolute inset-0 scale-[1.9]" style={{ transformOrigin: origin }}>
        <ProjectVisual variant={project.visualVariant} accent={project.accent} title={label} className="size-full" />
      </div>
    </div>
  );
}
