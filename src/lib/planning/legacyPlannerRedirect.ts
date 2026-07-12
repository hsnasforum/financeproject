import { resolveRouteVisibility } from "../navigation/routeRegistry";
import { PLANNING_CANONICAL_ROUTES } from "./routes";

function normalizeSlug(slug: readonly string[]): string[] {
  return slug
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function resolveLegacyPlannerRedirectFromSlug(slug: readonly string[]): string {
  const normalized = normalizeSlug(slug);
  if (normalized.length < 1) return PLANNING_CANONICAL_ROUTES.user.home;
  const candidate = `${PLANNING_CANONICAL_ROUTES.user.home}/${normalized.join("/")}`;
  const route = resolveRouteVisibility(candidate);
  if (route.kind === "page") return candidate;
  if (route.kind === "redirect" && route.canonicalHref) return route.canonicalHref;
  return PLANNING_CANONICAL_ROUTES.user.home;
}

export function resolveLegacyPlannerRedirectFromPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (trimmed === "/planner" || trimmed === "/planner/") return PLANNING_CANONICAL_ROUTES.user.home;
  if (!trimmed.startsWith("/planner/")) return PLANNING_CANONICAL_ROUTES.user.home;
  return resolveLegacyPlannerRedirectFromSlug(trimmed.slice("/planner/".length).split("/"));
}
