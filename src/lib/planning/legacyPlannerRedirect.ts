const SUPPORTED_LEGACY_PLANNER_HEADS = new Set([
  "reports",
  "runs",
  "trash",
  "v3",
]);

function normalizeSlug(slug: readonly string[]): string[] {
  return slug
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function resolveLegacyPlannerRedirectFromSlug(slug: readonly string[]): string {
  const normalized = normalizeSlug(slug);
  if (normalized.length < 1) return "/planning";
  return SUPPORTED_LEGACY_PLANNER_HEADS.has(normalized[0] ?? "")
    ? `/planning/${normalized.join("/")}`
    : "/planning";
}

export function resolveLegacyPlannerRedirectFromPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (trimmed === "/planner" || trimmed === "/planner/") return "/planning";
  if (!trimmed.startsWith("/planner/")) return "/planning";
  return resolveLegacyPlannerRedirectFromSlug(trimmed.slice("/planner/".length).split("/"));
}
