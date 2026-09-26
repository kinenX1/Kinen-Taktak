import { requireUser } from "@/lib/auth/dal";
import { getUserProfile } from "@/lib/data/client";
import { formatDate } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/dashboard/profile-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getUserProfile(user.id);
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" description={`Client since ${formatDate(profile.createdAt)}.`} />
      <Panel title="Your details">
        <ProfileForm profile={profile} />
      </Panel>
    </>
  );
}
