import {
  planningUserMeta,
  PlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { isPlanningNamespaceEnabled } from "@/lib/planning/store/namespace";

export function assumptionsUserMeta(
  user: PlanningRouteUser,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(extra ?? {}),
    ...planningUserMeta(user),
    ...(isPlanningNamespaceEnabled() ? { planningNamespaceEnabled: true } : {}),
  };
}
