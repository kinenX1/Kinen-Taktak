import type { Metadata } from "next";
import { projectTypes } from "@/config/project-brief";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { getI18n } from "@/i18n/server";
import { PageHero } from "@/components/layout/page-hero";
import { ProjectBriefForm, type BriefDefaults } from "@/components/brief/project-brief-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t.meta.startProject.title,
    description: t.meta.startProject.description,
    alternates: { canonical: "/start-project" },
    openGraph: { url: "/start-project", title: `${t.meta.startProject.title} — MovEra` },
  };
}

export default async function StartProjectPage({ searchParams }: PageProps<"/start-project">) {
  const params = await searchParams;
  const { t } = await getI18n();
  const user = await getCurrentUser();
  const draftRef = typeof params.draft === "string" ? params.draft : undefined;
  const requestedType = typeof params.type === "string" ? params.type : undefined;

  let defaults: BriefDefaults = {};
  let existingFileCount = 0;
  let activeDraft: string | undefined;

  if (user) {
    const profile = await db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, phone: true, company: true, country: true },
    });
    defaults = {
      contactName: profile?.name,
      contactEmail: profile?.email,
      contactPhone: profile?.phone ?? undefined,
      contactCompany: profile?.company ?? undefined,
      contactCountry: profile?.country ?? undefined,
    };

    if (draftRef) {
      // Ownership enforced by userId in the query.
      const draft = await db.projectRequest.findFirst({
        where: { reference: draftRef, userId: user.id, status: "DRAFT" },
        include: { _count: { select: { files: true } } },
      });
      if (draft) {
        activeDraft = draft.reference;
        existingFileCount = draft._count.files;
        defaults = {
          ...defaults,
          contactName: draft.contactName || defaults.contactName,
          contactEmail: draft.contactEmail || defaults.contactEmail,
          contactPhone: draft.contactPhone ?? defaults.contactPhone,
          contactCompany: draft.contactCompany ?? defaults.contactCompany,
          contactCountry: draft.contactCountry ?? defaults.contactCountry,
          title: draft.title,
          projectType: draft.projectType,
          otherType: draft.otherType ?? undefined,
          description: draft.description,
          business: draft.business ?? undefined,
          targetUsers: draft.targetUsers ?? undefined,
          features: draft.features ?? undefined,
          budget: draft.budget ?? undefined,
          budgetCustom: draft.budgetCustom ?? undefined,
          timeline: draft.timeline ?? undefined,
          inspiration: draft.inspiration.join("\n"),
          additionalInfo: draft.additionalInfo ?? undefined,
        };
      }
    }
  }

  if (!defaults.projectType && requestedType && projectTypes.some((t) => t.value === requestedType)) {
    defaults.projectType = requestedType;
  }

  return (
    <>
      <PageHero label={t.brief.label} title={[t.brief.title1, { text: t.brief.title2, className: "accent-serif text-flux" }]} intro={t.brief.intro} />
      <section className="container-x pb-24 md:pb-36">
        <ProjectBriefForm
          key={activeDraft ?? "new"}
          signedIn={!!user}
          defaults={defaults}
          draftRef={activeDraft}
          existingFileCount={existingFileCount}
        />
      </section>
    </>
  );
}
