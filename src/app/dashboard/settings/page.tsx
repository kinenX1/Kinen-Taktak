import { signOutOtherSessionsAction } from "@/actions/account";
import { requireUser } from "@/lib/auth/dal";
import { getUserSessions } from "@/lib/data/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/dashboard/settings-forms";

export const metadata = { title: "Settings" };

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const sessions = await getUserSessions(user.id);
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description="Security and account preferences." />
      <div className="space-y-8">
        <Panel title="Password">
          <ChangePasswordForm />
        </Panel>

        <Panel
          title={`Active sessions (${sessions.length})`}
          action={
            sessions.length > 1 && (
              <form action={signOutOtherSessionsAction}>
                <Button type="submit" size="sm" variant="secondary">
                  Sign out other sessions
                </Button>
              </form>
            )
          }
        >
          <ul className="divide-y divide-line">
            {sessions.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-fog-50">{describeAgent(s.userAgent)}</span>
                <span className="font-mono text-2xs text-fog-500">Signed in {formatDateTime(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {user.role !== "ADMIN" && (
          <Panel title={<span className="text-danger">Delete account</span>} className="border-danger/20">
            <DeleteAccountForm />
          </Panel>
        )}
      </div>
    </>
  );
}
