import Link from "next/link";
import { WordmarkLink } from "@/components/layout/wordmark";
import { AuthVisual } from "@/components/auth/auth-visual";
import { ArrowLeft } from "@/components/ui/icons";
import { getI18n } from "@/i18n/server";
import { LanguageSwitch } from "@/components/layout/language-switch";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <AuthVisual />
      <div className="flex flex-col">
        <header className="flex items-center justify-between gap-4 px-(--gutter) py-6 lg:justify-end">
          <WordmarkLink className="lg:hidden" />
          <div className="flex items-center gap-4">
            <LanguageSwitch id="auth-lang" />
            <Link href="/" className="group inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 transition-colors hover:text-fog-50">
              <ArrowLeft size={16} className="transition-transform duration-500 group-hover:-translate-x-1" />
              <span className="hidden sm:inline">{t.common.backToSite}</span>
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center px-(--gutter) pb-16 pt-6 outline-none">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
