import type { PortfolioCategory } from "@prisma/client";

/** Filters on /work. `value` of null means "All". Labels live in the dictionaries (`t.options.filters`). */
export const portfolioFilters: { label: string; value: PortfolioCategory | null; slug: string }[] = [
  { label: "All", value: null, slug: "all" },
  { label: "Websites", value: "WEBSITE", slug: "websites" },
  { label: "Apps", value: "APP", slug: "apps" },
  { label: "Web Apps", value: "WEB_APP", slug: "web-apps" },
  { label: "E-commerce", value: "ECOMMERCE", slug: "e-commerce" },
  { label: "Software", value: "SOFTWARE", slug: "software" },
  { label: "UI/UX", value: "UI_UX", slug: "ui-ux" },
];

export const categoryLabel: Record<PortfolioCategory, string> = {
  WEBSITE: "Website",
  APP: "Mobile App",
  WEB_APP: "Web App",
  ECOMMERCE: "E-commerce",
  SOFTWARE: "Software",
  UI_UX: "UI/UX",
};
