import type { Metadata } from "next";
import { getPublishedOpenings } from "@/lib/data/content";
import { getCurrentUser } from "@/lib/auth/dal";
import { SPONTANEOUS } from "@/config/careers";
import { getI18n } from "@/i18n/server";
import { PageHero } from "@/components/layout/page-hero";
import { ApplicationForm } from "@/components/careers/application-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.apply.title, description: t.meta.apply.description, alternates: { canonical: "/careers/apply" } };
}

export default async function ApplyPage({ searchParams }: PageProps<"/careers/apply">) {
  const { role } = await searchParams;
  const { locale, t } = await getI18n();
  const [openings, user] = await Promise.all([getPublishedOpenings(locale), getCurrentUser()]);
  const selected = typeof role === "string" && (role === SPONTANEOUS || openings.some((o) => o.slug === role)) ? role : "";

  return (
    <>
      <PageHero
        label={t.careers.form.label}
        title={[t.careers.form.title1, { text: t.careers.form.title2, className: "accent-serif text-flux" }]}
        intro={t.careers.form.lead}
      />
      <section className="container-x pb-24 md:pb-36">
        <ApplicationForm
          roles={openings.map((o) => ({ slug: o.slug, title: o.title, team: o.team }))}
          defaultRole={selected}
          defaults={user ? { fullName: user.name, email: user.email } : {}}
        />
      </section>
    </>
  );
}
