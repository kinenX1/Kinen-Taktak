import type { PortfolioCategory, VisualVariant } from "@prisma/client";

/**
 * DEMO PORTFOLIO — these are concept projects created to demonstrate the
 * kind of work MovEra delivers. They are NOT real clients and every entry is
 * seeded with `isDemo: true`, which the UI labels as "Concept".
 *
 * Replace them from /admin/portfolio once real case studies are available.
 */
export type PortfolioSeed = {
  slug: string;
  title: string;
  category: PortfolioCategory;
  client: string;
  year: number;
  summary: string;
  overview: string;
  challenge: string;
  solution: string;
  design: string;
  development: string;
  results: string[];
  technologies: string[];
  accent: string;
  visualVariant: VisualVariant;
  featured: boolean;
};

export const portfolioSeeds: PortfolioSeed[] = [
  {
    slug: "tavola",
    title: "Tavola",
    category: "APP",
    client: "Concept — Hospitality",
    year: 2026,
    summary:
      "A mobile ordering and reservations app for independent restaurants that want a direct line to their guests.",
    overview:
      "Tavola is a concept for a white-label mobile app that lets independent restaurants take reservations, pre-orders and loyalty in-house — without handing their guest relationships to marketplaces.",
    challenge:
      "Restaurant guests expect the convenience of large delivery platforms, but small restaurants can't afford to build and maintain that experience alone. The app needed to feel premium to guests and stay simple for staff during a busy service.",
    solution:
      "A single app template that each restaurant brands with its own menu, colours and photography. Guests can book a table, order ahead and collect rewards; staff manage everything from a lightweight tablet dashboard.",
    design:
      "We designed around the moment of hunger: large food photography, a menu that reads like the printed one, and an ordering flow reduced to three steps. The staff dashboard uses high-contrast states that work under kitchen lighting.",
    development:
      "Built as a cross-platform app with an offline-tolerant cart, real-time order status and a shared API that powers both the guest app and staff dashboard.",
    results: [
      "Ordering flow designed in three steps from menu to confirmation",
      "One codebase for iOS, Android and the staff tablet",
      "Brandable theme system for each restaurant",
    ],
    technologies: ["React Native", "Expo", "TypeScript", "Node.js", "PostgreSQL", "Stripe"],
    accent: "#FF7A45",
    visualVariant: "PHONE",
    featured: true,
  },
  {
    slug: "ledgerline",
    title: "Ledgerline",
    category: "WEB_APP",
    client: "Concept — Finance operations",
    year: 2026,
    summary:
      "A finance operations workspace that turns scattered invoices, approvals and reports into one calm dashboard.",
    overview:
      "Ledgerline is a concept web application for small finance teams who manage approvals across email, spreadsheets and accounting software.",
    challenge:
      "Finance teams at growing companies spend much of month-end chasing approvals and reconciling data between tools. Any replacement had to be trustworthy, auditable and faster than the spreadsheet it replaces.",
    solution:
      "A workspace with approval flows, a live cash overview and an audit log for every change. Integrations pull data from accounting tools so the team works from a single source of truth.",
    design:
      "Dense information presented calmly: a restrained palette, tabular numerals and clear hierarchy. Every approval screen answers the same three questions — what, how much and who decides.",
    development:
      "A typed full-stack application with role-based permissions, background sync jobs and an immutable audit trail stored alongside each record.",
    results: [
      "Approval flows with a complete audit trail",
      "Role-based access for approvers, finance and admins",
      "Dashboard optimised for keyboard-first navigation",
    ],
    technologies: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "Redis", "Docker"],
    accent: "#8B9CFF",
    visualVariant: "DASHBOARD",
    featured: true,
  },
  {
    slug: "atelier-nord",
    title: "Atelier Nord",
    category: "ECOMMERCE",
    client: "Concept — Furniture retail",
    year: 2025,
    summary:
      "An editorial e-commerce experience for a design-led furniture brand, with a configurator for made-to-order pieces.",
    overview:
      "Atelier Nord is a concept storefront for a furniture maker selling made-to-order pieces online, where customers choose materials, finishes and dimensions.",
    challenge:
      "Made-to-order furniture is a considered purchase. Customers need to understand materials and see their configuration before spending thousands online — and the brand needed to feel like a showroom, not a catalogue.",
    solution:
      "An editorial storefront with room-by-room collections, a live product configurator with transparent pricing and a checkout that sets clear expectations about production and delivery.",
    design:
      "Magazine-style layouts, generous whitespace and a warm neutral palette let the product lead. Material swatches are large and tactile, and every price change is explained.",
    development:
      "A headless commerce build with a custom configurator, server-rendered product pages for search visibility and integrations for payments and order management.",
    results: [
      "Configurator with live, itemised pricing",
      "Server-rendered catalogue for search visibility",
      "Checkout with clear production timelines",
    ],
    technologies: ["Next.js", "Shopify Storefront API", "TypeScript", "Stripe", "Headless CMS"],
    accent: "#E3B774",
    visualVariant: "COMMERCE",
    featured: true,
  },
  {
    slug: "halden-architects",
    title: "Halden Architects",
    category: "WEBSITE",
    client: "Concept — Architecture studio",
    year: 2025,
    summary:
      "A portfolio website for an architecture studio where each project unfolds like a walk through the building.",
    overview:
      "Halden is a concept website for an architecture practice that wanted its online presence to feel as considered as its buildings.",
    challenge:
      "Architecture portfolios often become image grids that flatten the work. The studio needed a site that communicates process, material and place — and that the team could update themselves.",
    solution:
      "Long-form project stories that combine photography, drawings and short texts in a scroll-driven narrative, powered by a CMS with flexible layout blocks.",
    design:
      "An architectural grid, restrained typography and slow, deliberate motion. Images are given room to breathe, and drawings are presented at full width.",
    development:
      "A statically generated site with a headless CMS, responsive image pipelines and scroll animations that respect reduced-motion preferences.",
    results: [
      "Flexible story blocks editable by the studio",
      "Responsive image pipeline for large photography",
      "Reduced-motion friendly scroll narrative",
    ],
    technologies: ["Next.js", "TypeScript", "Headless CMS", "Motion", "Vercel"],
    accent: "#D8D2C4",
    visualVariant: "BROWSER",
    featured: false,
  },
  {
    slug: "fleetwise",
    title: "Fleetwise",
    category: "SOFTWARE",
    client: "Concept — Logistics",
    year: 2026,
    summary:
      "Dispatch and route-planning software for regional delivery fleets, with a live map and driver companion app.",
    overview:
      "Fleetwise is a concept operations platform for regional logistics companies coordinating drivers, vehicles and time-sensitive deliveries.",
    challenge:
      "Dispatchers were juggling phone calls, whiteboards and a legacy desktop tool. Any new system had to be learnable in a day and dependable in the middle of a disrupted shift.",
    solution:
      "A dispatch console with a live map, drag-and-drop assignment and automatic route suggestions, paired with a simple driver app for status updates and proof of delivery.",
    design:
      "A dark, high-contrast console built for long shifts, with colour reserved for exceptions so problems stand out immediately.",
    development:
      "Event-driven backend with real-time updates over WebSockets, a routing service and offline-tolerant driver sync.",
    results: [
      "Real-time map with live vehicle positions",
      "Drag-and-drop dispatch with route suggestions",
      "Proof of delivery captured in the driver app",
    ],
    technologies: ["TypeScript", "Node.js", "WebSockets", "PostgreSQL", "PostGIS", "React Native"],
    accent: "#3DDC97",
    visualVariant: "SYSTEM",
    featured: true,
  },
  {
    slug: "pulse-care",
    title: "Pulse Care",
    category: "UI_UX",
    client: "Concept — Digital health",
    year: 2025,
    summary:
      "A patient companion app and design system focused on clarity, calm and accessibility.",
    overview:
      "Pulse Care is a concept UX project for a patient companion app — appointments, medication reminders and secure messaging with a care team.",
    challenge:
      "Health apps are often used by people who are stressed, unwell or unfamiliar with technology. Every screen needed to be readable, forgiving and accessible without feeling clinical.",
    solution:
      "A simplified information architecture with one primary action per screen, supported by a design system built for large type, high contrast and screen readers.",
    design:
      "Soft, warm colours, generous touch targets and plain-language copy. Components were designed and documented with accessibility annotations from the start.",
    development:
      "Delivered as a tokenised design system with a coded component library, making the design straightforward to implement across web and mobile.",
    results: [
      "Design system with accessibility annotations",
      "WCAG AA contrast across all components",
      "One primary action per screen",
    ],
    technologies: ["Figma", "Design tokens", "React", "Storybook", "Accessibility testing"],
    accent: "#FF6B8B",
    visualVariant: "PHONE",
    featured: false,
  },
];
