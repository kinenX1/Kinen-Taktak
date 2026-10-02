import { requireUser } from "@/lib/auth/dal";
import { getUserProfile } from "@/lib/data/client";
import { avatarUrl } from "@/lib/avatar";
import { fmt } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { formatDate } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { AvatarUploader } from "@/components/dashboard/avatar-uploader";
import { LanguageSwitch } from "@/components/layout/language-switch";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.profile.title };
}

export default async function ProfilePage() {
  const user = await requireUser();
  const { locale, t } = await getI18n();
  const p = t.dashboard.profile;
  const profile = await getUserProfile(user.id);
  return (
    <>
      <PageHeader eyebrow={p.eyebrow} title={p.title} description={fmt(p.since, { date: formatDate(profile.createdAt, {}, locale) })} />
      <div className="grid gap-8 lg:grid-cols-3">
        <Panel title={p.photo} className="lg:row-span-2">
          <AvatarUploader name={profile.name} src={avatarUrl(profile)} />
        </Panel>
        <Panel title={p.details} className="lg:col-span-2">
          <ProfileForm profile={profile} />
        </Panel>
        <Panel title={p.language} className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
            <p className="max-w-md text-sm leading-relaxed text-fog-400">{p.languageLead}</p>
            <LanguageSwitch id="profile-lang" />
          </div>
        </Panel>
      </div>
    </>
  );
}
