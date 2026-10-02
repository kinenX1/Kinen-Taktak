import { signOutOtherSessionsAction } from "@/actions/account";
import { requireUser } from "@/lib/auth/dal";
import { getUserSessions } from "@/lib/data/client";
import { formatDateTime } from "@/lib/utils";
import { fmt } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/dashboard/settings-forms";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.settings.title };
}

function describeAgent(ua: string | null, t: Dictionary["dashboard"]["settings"]) {
  if (!ua) return t.unknownDevice;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? fmt(t.browserOn, { browser, os }) : browser;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const sessions = await getUserSessions(user.id);
  const { locale, t: dict } = await getI18n();
  const t = dict.dashboard.settings;
  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.lead} />
      <div className="space-y-8">
        <Panel title={t.password}>
          <ChangePasswordForm />
        </Panel>

        <Panel
          title={fmt(t.sessions, { count: sessions.length })}
          action={
            sessions.length > 1 && (
              <form action={signOutOtherSessionsAction}>
                <Button type="submit" size="sm" variant="secondary">
                  {t.signOutOthers}
                </Button>
              </form>
            )
          }
        >
          <ul className="divide-y divide-line">
            {sessions.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-fog-50">{describeAgent(s.userAgent, t)}</span>
                <span className="font-mono text-2xs text-fog-500">{fmt(t.signedIn, { date: formatDateTime(s.createdAt, locale) })}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {user.role !== "ADMIN" && (
          <Panel title={<span className="text-danger">{t.delete}</span>} className="border-danger/20">
            <DeleteAccountForm />
          </Panel>
        )}
      </div>
    </>
  );
}
