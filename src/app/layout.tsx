import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { siteConfig } from "@/config/site";
import { getI18n } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import { MotionProvider } from "@/components/motion/motion-provider";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: t.meta.homeTitle,
      template: `%s — ${siteConfig.name}`,
    },
    description: t.meta.description,
    applicationName: siteConfig.name,
    keywords: [
      "digital product studio",
      "web development",
      "web applications",
      "mobile apps",
      "SaaS development",
      "UI/UX design",
      "e-commerce",
      "automation",
      "AI products",
    ],
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: t.meta.homeTitle,
      description: t.meta.description,
      url: "/",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      alternateLocale: locale === "fr" ? "en_US" : "fr_FR",
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: "/" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#060709",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable} ${instrument.variable} antialiased`}>
      <body>
        {/* Without JavaScript, never leave animated content invisible. */}
        <noscript>
          <style>{`[style*="opacity:0"],[style*="opacity: 0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-full bg-fog-50 px-5 py-3 text-sm font-medium text-ink-950 transition-transform focus:translate-y-0"
        >
          {t.common.skipToContent}
        </a>
        <I18nProvider locale={locale} t={t}>
          <MotionProvider>{children}</MotionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
