import type { PortfolioCategory } from "@prisma/client";

/**
 * Source content for MovEra services. Seeded into the database by
 * `npm run db:seed`, after which services are managed from /admin/services.
 */
export type ServiceSeed = {
  slug: string;
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  audience: string;
  capabilities: string[];
  benefits: string[];
  technologies: string[];
  relatedCategories: PortfolioCategory[];
};

export const serviceSeeds: ServiceSeed[] = [
  {
    slug: "websites",
    title: "Website Development",
    shortTitle: "Websites",
    tagline: "Sites that load fast, read clearly and make people act.",
    description:
      "We design and build marketing and brand websites from the ground up — structured around what your visitors need to understand and what you need them to do. Every site ships with a content system your team can actually use.",
    audience:
      "Companies launching a new brand, replacing a site that no longer reflects them, or preparing for growth that a template can't carry.",
    capabilities: [
      "Brand and marketing websites",
      "Landing pages and campaign sites",
      "Headless CMS integration",
      "Motion and interaction design",
      "Technical SEO and performance",
      "Analytics and conversion tracking",
    ],
    benefits: [
      "A site that explains your business in seconds",
      "Content your team can update without a developer",
      "Strong Core Web Vitals on real devices",
      "Accessible to every visitor",
    ],
    technologies: ["Next.js", "React", "TypeScript", "Tailwind CSS", "Headless CMS", "Vercel"],
    relatedCategories: ["WEBSITE"],
  },
  {
    slug: "web-apps",
    title: "Web Applications",
    shortTitle: "Web Apps",
    tagline: "Serious software that runs in the browser.",
    description:
      "Client portals, booking systems, dashboards and internal tools. We handle product thinking, interface design, backend architecture and deployment — so the application works on day one and keeps working as you grow.",
    audience:
      "Businesses whose operations have outgrown spreadsheets and email, and founders turning a workflow into a product.",
    capabilities: [
      "Product discovery and scoping",
      "Authentication, roles and permissions",
      "Dashboards and data visualisation",
      "Payments and third-party integrations",
      "APIs and backend services",
      "Hosting, monitoring and maintenance",
    ],
    benefits: [
      "One system instead of five disconnected tools",
      "Security designed in, not bolted on",
      "An architecture that scales with usage",
      "Clear ownership of your code and data",
    ],
    technologies: ["Next.js", "Node.js", "TypeScript", "PostgreSQL", "Prisma", "Docker"],
    relatedCategories: ["WEB_APP", "SOFTWARE"],
  },
  {
    slug: "mobile-apps",
    title: "Mobile Applications",
    shortTitle: "Mobile Apps",
    tagline: "Native-feeling apps for iOS and Android.",
    description:
      "We build cross-platform mobile apps that feel at home on each device — with offline support, push notifications and the polish people expect from apps they keep on their home screen.",
    audience:
      "Brands building a direct relationship with customers, and products where the phone is the primary place people work.",
    capabilities: [
      "iOS and Android from one codebase",
      "Offline-first data sync",
      "Push notifications",
      "In-app purchases and payments",
      "App Store and Google Play release",
      "Companion admin dashboards",
    ],
    benefits: [
      "Faster time to market on both platforms",
      "Consistent experience across devices",
      "A release process you can repeat",
      "Analytics that show how the app is used",
    ],
    technologies: ["React Native", "Expo", "TypeScript", "Swift", "Kotlin", "Firebase"],
    relatedCategories: ["APP"],
  },
  {
    slug: "ui-ux-design",
    title: "UI/UX Design",
    shortTitle: "UI/UX Design",
    tagline: "Interfaces people understand without instructions.",
    description:
      "Research, information architecture, interaction design and visual systems. We design products that are clear on first use and still pleasant on the thousandth — and we hand over design systems engineers can build from.",
    audience:
      "Teams starting a new product, redesigning a complex one, or needing a design system to keep many screens consistent.",
    capabilities: [
      "User research and interviews",
      "Information architecture",
      "Wireframes and interactive prototypes",
      "Visual and interaction design",
      "Design systems and component libraries",
      "Usability testing",
    ],
    benefits: [
      "Fewer support questions and drop-offs",
      "Decisions grounded in how people really behave",
      "Faster engineering with a shared component language",
      "A product that looks like one product",
    ],
    technologies: ["Figma", "Prototyping", "Design tokens", "Storybook", "Accessibility audits"],
    relatedCategories: ["UI_UX"],
  },
  {
    slug: "custom-software",
    title: "Custom Software",
    shortTitle: "Custom Software",
    tagline: "Software shaped around how your business actually works.",
    description:
      "When off-the-shelf tools force you to bend your process, we build systems that fit it instead — from operations platforms to integrations that connect the tools you already rely on.",
    audience:
      "Operations-heavy businesses with unique processes, and teams stuck stitching together tools that don't talk to each other.",
    capabilities: [
      "Operations and back-office systems",
      "System integrations and data pipelines",
      "Legacy modernisation",
      "Reporting and business intelligence",
      "Role-based access control",
      "Long-term support",
    ],
    benefits: [
      "Processes encoded once, run consistently",
      "Less manual data entry",
      "Real-time visibility across the business",
      "No per-seat licensing surprises",
    ],
    technologies: ["TypeScript", "Node.js", "Python", "PostgreSQL", "REST & GraphQL", "Cloud infrastructure"],
    relatedCategories: ["SOFTWARE", "WEB_APP"],
  },
  {
    slug: "e-commerce",
    title: "E-commerce",
    shortTitle: "E-commerce",
    tagline: "Stores designed to be browsed, trusted and bought from.",
    description:
      "From product discovery to checkout, we build commerce experiences that reflect your brand and remove friction — on hosted platforms or fully custom stacks, depending on what your catalogue and operations need.",
    audience:
      "Brands moving beyond a starter store, and retailers who need custom product logic, integrations or checkout flows.",
    capabilities: [
      "Storefront design and development",
      "Headless commerce",
      "Product configurators",
      "Checkout and payment integration",
      "Inventory and ERP integration",
      "Subscriptions and memberships",
    ],
    benefits: [
      "A store that feels like your brand, not a theme",
      "Faster pages on mobile, where most shopping happens",
      "Operations that scale with order volume",
      "Freedom to change platforms later",
    ],
    technologies: ["Shopify", "Next.js", "Stripe", "Headless CMS", "Algolia", "TypeScript"],
    relatedCategories: ["ECOMMERCE"],
  },
  {
    slug: "saas",
    title: "SaaS Products",
    shortTitle: "SaaS",
    tagline: "From idea to subscription product.",
    description:
      "We help founders and companies design, build and launch software-as-a-service products — multi-tenant architecture, billing, onboarding and the admin tooling you'll need once real customers arrive.",
    audience:
      "Founders validating a product, and established companies turning internal expertise into a sellable platform.",
    capabilities: [
      "MVP scoping and roadmap",
      "Multi-tenant architecture",
      "Subscription billing",
      "Onboarding and activation flows",
      "Admin and support tooling",
      "Usage analytics",
    ],
    benefits: [
      "Launch with the essentials, not everything",
      "Foundations that survive the first thousand customers",
      "Billing and permissions handled properly",
      "A product team on call as you iterate",
    ],
    technologies: ["Next.js", "TypeScript", "PostgreSQL", "Stripe Billing", "Redis", "AWS"],
    relatedCategories: ["WEB_APP", "SOFTWARE"],
  },
  {
    slug: "automation",
    title: "Automation",
    shortTitle: "Automation",
    tagline: "Hand the repetitive work to software.",
    description:
      "We map your workflows, find the steps people shouldn't be doing by hand and automate them — connecting forms, inboxes, spreadsheets, CRMs and internal systems into reliable pipelines.",
    audience:
      "Teams losing hours to copy-paste, manual reporting or chasing information between tools.",
    capabilities: [
      "Workflow mapping",
      "API integrations",
      "Document and data processing",
      "Scheduled reports and alerts",
      "Approval flows",
      "Monitoring and error handling",
    ],
    benefits: [
      "Hours returned to your team every week",
      "Fewer errors from manual handling",
      "Processes that run the same way every time",
      "Clear logs when something needs attention",
    ],
    technologies: ["Node.js", "Python", "Webhooks", "Zapier & Make", "Cron & queues", "REST APIs"],
    relatedCategories: ["SOFTWARE"],
  },
  {
    slug: "ai-products",
    title: "AI Products",
    shortTitle: "AI Products",
    tagline: "Useful intelligence, built into real products.",
    description:
      "We design and build AI features that solve specific problems — assistants grounded in your own knowledge, smart search, document understanding and workflow copilots — with the evaluation and guardrails to trust them in production.",
    audience:
      "Businesses with a clear problem AI can help with, and product teams adding intelligent features to existing software.",
    capabilities: [
      "AI assistants and chat interfaces",
      "Retrieval over your own content",
      "Document extraction and classification",
      "Workflow copilots and agents",
      "Evaluation and quality monitoring",
      "Privacy-conscious deployment",
    ],
    benefits: [
      "AI applied where it creates real value",
      "Answers grounded in your data",
      "Measurable quality before launch",
      "Costs and latency kept under control",
    ],
    technologies: ["LLM APIs", "Embeddings & vector search", "TypeScript", "Python", "PostgreSQL", "Evaluation tooling"],
    relatedCategories: ["WEB_APP", "SOFTWARE"],
  },
];
