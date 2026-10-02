import type { EmploymentType, WorkMode } from "@prisma/client";

/**
 * Initial job openings. They are inserted by the database migration and the
 * seed script, then managed from /admin/careers. French versions of these
 * texts live in src/content/fr/careers.ts, keyed by slug.
 */
export type OpeningSeed = {
  slug: string;
  title: string;
  team: string;
  location: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
};

export const openingSeeds: OpeningSeed[] = [
  {
    slug: "frontend-engineer",
    title: "Frontend Engineer (React / Next.js)",
    team: "Engineering",
    location: "Remote",
    employmentType: "FULL_TIME",
    workMode: "REMOTE",
    summary:
      "Build fast, animated, accessible interfaces for client websites and web apps, from the first prototype to production.",
    responsibilities: [
      "Turn Figma designs into pixel-accurate React and Next.js interfaces",
      "Build motion and micro-interactions that stay smooth on every device",
      "Keep performance, accessibility and SEO high on every release",
      "Review code and share what you learn with the team",
    ],
    requirements: [
      "2+ years building production interfaces with React and TypeScript",
      "Solid CSS skills, including layout, responsive design and animation",
      "Experience with Next.js or a similar framework",
      "Clear written communication in English or French",
    ],
    niceToHave: ["Motion, GSAP or three.js experience", "An eye for typography and detail"],
  },
  {
    slug: "full-stack-engineer",
    title: "Full-stack Engineer (Node.js / PostgreSQL)",
    team: "Engineering",
    location: "Remote",
    employmentType: "FULL_TIME",
    workMode: "REMOTE",
    summary:
      "Design and ship the backends behind our client platforms: APIs, databases, authentication, payments and integrations.",
    responsibilities: [
      "Design data models and APIs for SaaS, e-commerce and internal tools",
      "Implement secure authentication, roles and permissions",
      "Integrate payments, email and third-party services",
      "Deploy, monitor and improve production systems",
    ],
    requirements: [
      "3+ years of backend or full-stack experience with Node.js and TypeScript",
      "Strong SQL and PostgreSQL knowledge",
      "Good understanding of web security basics",
      "Comfortable owning a feature end to end",
    ],
    niceToHave: ["Experience with Prisma, serverless or Vercel", "AI or automation projects"],
  },
  {
    slug: "product-designer",
    title: "Product Designer (UI/UX)",
    team: "Design",
    location: "Remote",
    employmentType: "FULL_TIME",
    workMode: "REMOTE",
    summary:
      "Shape how our clients' products look, feel and work, from research and flows to polished interfaces and design systems.",
    responsibilities: [
      "Run discovery workshops and map user journeys",
      "Design wireframes, prototypes and high-fidelity interfaces",
      "Build and maintain design systems in Figma",
      "Work closely with engineers until the product ships",
    ],
    requirements: [
      "A portfolio showing real product design work",
      "Strong Figma skills, including components and prototyping",
      "Understanding of accessibility and responsive design",
      "Able to explain and defend design decisions",
    ],
    niceToHave: ["Motion design skills", "Basic HTML and CSS"],
  },
  {
    slug: "motion-designer",
    title: "Motion Designer",
    team: "Design",
    location: "Remote",
    employmentType: "FREELANCE",
    workMode: "REMOTE",
    summary:
      "Create animated ads, product presentations and interface motion that make brands feel alive.",
    responsibilities: [
      "Design and animate ads and social content for client brands",
      "Create motion guidelines and interaction specs for products",
      "Produce launch videos and product showcases",
    ],
    requirements: [
      "A showreel with motion graphics work",
      "After Effects, Blender, Rive or a similar tool",
      "A strong sense of timing, rhythm and composition",
    ],
    niceToHave: ["3D skills", "Experience animating for the web"],
  },
  {
    slug: "mobile-developer",
    title: "Mobile Developer (React Native / Flutter)",
    team: "Engineering",
    location: "Remote",
    employmentType: "FREELANCE",
    workMode: "REMOTE",
    summary: "Build iOS and Android apps for our clients, from the first build to the App Store and Google Play.",
    responsibilities: [
      "Build cross-platform mobile apps with clean, testable code",
      "Connect apps to APIs, push notifications and payments",
      "Publish and maintain apps on the App Store and Google Play",
    ],
    requirements: [
      "Apps you built that are live in a store",
      "React Native or Flutter experience",
      "Understanding of mobile UX conventions",
    ],
    niceToHave: ["Native iOS or Android experience", "Offline-first apps"],
  },
  {
    slug: "content-marketer",
    title: "Social Media & Content Marketer",
    team: "Marketing",
    location: "Remote",
    employmentType: "PART_TIME",
    workMode: "REMOTE",
    summary: "Tell the MovEra story on Instagram, LinkedIn and TikTok, and help new clients discover our work.",
    responsibilities: [
      "Plan and publish content across our social channels",
      "Turn our projects into case studies, reels and posts",
      "Track results and grow our audience",
    ],
    requirements: [
      "Experience growing a brand or creator account",
      "Strong writing in English and French",
      "Comfortable with Canva, CapCut or similar tools",
    ],
    niceToHave: ["Photography or video skills", "Paid ads experience"],
  },
  {
    slug: "web-development-intern",
    title: "Web Development Intern",
    team: "Engineering",
    location: "Remote",
    employmentType: "INTERNSHIP",
    workMode: "REMOTE",
    summary: "Learn how real client products are built by working alongside our engineers on live projects.",
    responsibilities: [
      "Build components and pages with React and Next.js",
      "Fix bugs and write small features with a mentor",
      "Join reviews, planning and client demos",
    ],
    requirements: [
      "Basic HTML, CSS and JavaScript",
      "A personal project or school project you can show",
      "Curiosity and the will to learn fast",
    ],
    niceToHave: ["React basics", "Git and GitHub"],
  },
];
