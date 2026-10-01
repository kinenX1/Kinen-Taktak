/**
 * Brand-level settings. Edit these to change contact details, social links
 * and the announcement bar without touching components.
 */
export const siteConfig = {
  name: "NovaWear",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  description:
    "NovaWear — streetwear marked with the N and the running leopard. Tees, pants, hoodies and pyjamas. Order now or pre-order your size.",
  tagline: "Run with the pack.",
  /** Public contact address shown in the footer and in emails. */
  email: "hello@novawear.example",
  /** Optional phone number shown in the footer; null hides it. */
  phone: null as string | null,
  socials: [
    { label: "Instagram", href: "https://instagram.com/", icon: "Instagram" as const },
    { label: "TikTok", href: "https://www.tiktok.com/", icon: "TikTok" as const },
  ],
  hashtag: "#NovaWearPack",
  /** Messages that scroll in the black bar at the very top of the store. */
  announcements: [
    "Pre-order Drop 01 — Leopard Season",
    "Tees · Pants · Hoodies · Pyjamas",
    "Order now or pre-order your size",
    "Create an account to track every order",
  ],
};

export const mainNav = [
  { label: "Shop", href: "/shop" },
  { label: "T-Shirts", href: "/shop?category=t-shirts" },
  { label: "Pants", href: "/shop?category=pants" },
  { label: "Hoodies", href: "/shop?category=hoodies" },
  { label: "Pyjamas", href: "/shop?category=pyjamas" },
  { label: "About", href: "/about" },
] as const;
