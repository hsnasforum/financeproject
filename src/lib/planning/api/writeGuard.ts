import {
  assertSameOrigin,
  requireCsrf,
} from "../../dev/devGuards";

export type PlanningWriteGuardBody = {
  csrf?: unknown;
} | null | undefined;

function csrfBody(body: PlanningWriteGuardBody): { csrf: string } {
  return {
    csrf: typeof body?.csrf === "string" ? body.csrf.trim() : "",
  };
}

export function assertPlanningWriteGuard(request: Request, body: PlanningWriteGuardBody): void {
  assertSameOrigin(request);
  requireCsrf(request, csrfBody(body), { allowWhenCookieMissing: true });
}
