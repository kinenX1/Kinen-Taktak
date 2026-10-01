/** Join class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string) {
  return formatDate(date, { hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Only allow same-site relative redirects, e.g. after login. */
export function safeRedirectPath(value: unknown, fallback = "/account") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "product"
  );
}
