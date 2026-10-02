/**
 * Global site configuration. Edit this file to change navigation,
 * contact details and social links across the whole site.
 */
export const siteConfig = {
  name: "MovEra",
  wordmark: "MOVeRA",
  tagline: "Digital products for businesses in motion.",
  description:
    "MovEra is a digital product studio. We design and engineer websites, web and mobile applications, SaaS platforms, e-commerce, automation and AI-powered products.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  email: "MovEra.Company@gmail.com",
  /** Leave a link empty to hide it everywhere. */
  socials: [
    { label: "LinkedIn", href: "" },
    { label: "GitHub", href: "" },
    { label: "Instagram", href: "" },
    { label: "X", href: "" },
  ],
  /**
   * Optional promise shown after a project request is submitted.
   * Keep it `null` unless the team has committed to a response time.
   */
  responseTimePromise: null as string | null,
} as const;

/** Labels come from the dictionaries (`t.nav[key]`). */
export const mainNav = [
  { key: "home", href: "/" },
  { key: "work", href: "/work" },
  { key: "services", href: "/services" },
  { key: "about", href: "/about" },
  { key: "careers", href: "/careers" },
  { key: "contact", href: "/contact" },
] as const;

/** Labels come from the dictionaries (`t.footer[key]`). */
export const legalNav = [
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
] as const;

export const activeSocials = () => siteConfig.socials.filter((s) => s.href);
