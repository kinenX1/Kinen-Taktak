import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { siteConfig } from "@/config/site";
import { MotionProvider } from "@/components/motion/motion-provider";
import "./globals.css";

// Archivo's width axis gives the condensed display cut (font-stretch: 62.5%).
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: ["NovaWear", "streetwear", "t-shirts", "hoodies", "pants", "pyjamas", "pre-order", "clothing brand"],
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#e7e6e2",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable} antialiased`}>
      <body>
        {/* Without JavaScript, never leave animated content invisible. */}
        <noscript>
          <style>{`[style*="opacity:0"],[style*="opacity: 0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="label fixed left-4 top-4 z-[100] -translate-y-24 bg-ink px-5 py-3 text-sm text-bone transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
