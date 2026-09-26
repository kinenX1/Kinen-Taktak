import type { ProjectType, RequestStatus } from "@prisma/client";

/**
 * Configurable options for the project brief (/start-project).
 * Keys are persisted in the database — change labels freely, but keep
 * existing keys stable (or migrate stored rows) when editing.
 */

export const projectTypes: { value: ProjectType; label: string; hint: string }[] = [
  { value: "WEBSITE", label: "Website", hint: "Marketing sites, brand sites, landing pages" },
  { value: "WEB_APP", label: "Web App", hint: "Portals, tools and interactive platforms" },
  { value: "MOBILE_APP", label: "Mobile App", hint: "iOS and Android applications" },
  { value: "ECOMMERCE", label: "E-commerce", hint: "Online stores and checkout flows" },
  { value: "SAAS", label: "SaaS", hint: "Subscription software products" },
  { value: "CUSTOM_SOFTWARE", label: "Custom Software", hint: "Internal systems and integrations" },
  { value: "UI_UX", label: "UI/UX", hint: "Product design, research and prototypes" },
  { value: "AUTOMATION", label: "Automation", hint: "Workflows that remove manual work" },
  { value: "AI", label: "AI", hint: "Assistants, search and intelligent features" },
  { value: "OTHER", label: "Other", hint: "Something that does not fit a box" },
];

export const budgetRanges = [
  { value: "not-sure", label: "Not sure yet" },
  { value: "under-1k", label: "Under $1,000" },
  { value: "1k-5k", label: "$1,000 – $5,000" },
  { value: "5k-10k", label: "$5,000 – $10,000" },
  { value: "10k-plus", label: "$10,000+" },
  { value: "custom", label: "Custom amount" },
] as const;

export const timelines = [
  { value: "asap", label: "As soon as possible" },
  { value: "1-month", label: "Within 1 month" },
  { value: "1-3-months", label: "1 – 3 months" },
  { value: "3-6-months", label: "3 – 6 months" },
  { value: "flexible", label: "Flexible" },
] as const;

export const requestStatuses: {
  value: RequestStatus;
  label: string;
  description: string;
  tone: "neutral" | "info" | "accent" | "success" | "danger";
}[] = [
  { value: "DRAFT", label: "Draft", description: "Not submitted yet.", tone: "neutral" },
  { value: "SUBMITTED", label: "Submitted", description: "We have received your brief.", tone: "info" },
  { value: "UNDER_REVIEW", label: "Under Review", description: "Our team is reviewing the details.", tone: "info" },
  { value: "CONTACTED", label: "Contacted", description: "We have reached out to discuss next steps.", tone: "accent" },
  { value: "PROPOSAL", label: "Proposal", description: "A proposal has been prepared for you.", tone: "accent" },
  { value: "IN_PROGRESS", label: "In Progress", description: "Your project is being designed and built.", tone: "accent" },
  { value: "COMPLETED", label: "Completed", description: "The project has been delivered.", tone: "success" },
  { value: "CANCELLED", label: "Cancelled", description: "This request is closed.", tone: "danger" },
];

/** Statuses where a request is considered an active or delivered project. */
export const projectStatuses: RequestStatus[] = ["IN_PROGRESS", "COMPLETED"];

/** The happy-path lifecycle, used to draw progress timelines. */
export const statusFlow: RequestStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "CONTACTED",
  "PROPOSAL",
  "IN_PROGRESS",
  "COMPLETED",
];

export const uploadRules = {
  maxFiles: 5,
  maxFileSizeMb: 10,
  accept: ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md",
} as const;

export const labelFor = {
  projectType: (v: string | null | undefined) =>
    projectTypes.find((t) => t.value === v)?.label ?? "—",
  budget: (v: string | null | undefined) =>
    budgetRanges.find((b) => b.value === v)?.label ?? "—",
  timeline: (v: string | null | undefined) =>
    timelines.find((t) => t.value === v)?.label ?? "—",
  status: (v: string | null | undefined) =>
    requestStatuses.find((s) => s.value === v)?.label ?? "—",
};
