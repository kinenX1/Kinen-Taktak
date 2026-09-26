import Link from "next/link";
import { WordmarkLink } from "@/components/layout/wordmark";
import { AuthVisual } from "@/components/auth/auth-visual";
import { ArrowLeft } from "@/components/ui/icons";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <AuthVisual />
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-(--gutter) py-6 lg:justify-end">
          <WordmarkLink className="lg:hidden" />
          <Link href="/" className="group inline-flex min-h-11 items-center gap-2 text-sm text-fog-400 transition-colors hover:text-fog-50">
            <ArrowLeft size={16} className="transition-transform duration-500 group-hover:-translate-x-1" />
            Back to site
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center px-(--gutter) pb-16 pt-6 outline-none">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
