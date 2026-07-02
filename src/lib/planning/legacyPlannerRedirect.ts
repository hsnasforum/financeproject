import { PLANNING_CANONICAL_ROUTES } from "./routes";

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
  if (normalized.length < 1) return PLANNING_CANONICAL_ROUTES.user.home;
  return SUPPORTED_LEGACY_PLANNER_HEADS.has(normalized[0] ?? "")
    ? `${PLANNING_CANONICAL_ROUTES.user.home}/${normalized.join("/")}`
    : PLANNING_CANONICAL_ROUTES.user.home;
}

export function resolveLegacyPlannerRedirectFromPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (trimmed === "/planner" || trimmed === "/planner/") return PLANNING_CANONICAL_ROUTES.user.home;
  if (!trimmed.startsWith("/planner/")) return PLANNING_CANONICAL_ROUTES.user.home;
  return resolveLegacyPlannerRedirectFromSlug(trimmed.slice("/planner/".length).split("/"));
}
