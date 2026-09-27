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

export const mainNav = [
  { label: "Home", href: "/" },
  { label: "Work", href: "/work" },
  { label: "Services", href: "/services" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export const legalNav = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
] as const;

export const activeSocials = () => siteConfig.socials.filter((s) => s.href);
