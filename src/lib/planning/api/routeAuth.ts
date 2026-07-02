import { jsonError } from "./response";
import {
  isPlanningAuthError,
  requireCurrentPlanningUser,
  type PlanningCurrentUser,
} from "../auth/currentUser";
import { runWithPlanningUserScope } from "../store/userScope";

export type PlanningRouteUser = PlanningCurrentUser;
export type PlanningAuthErrorResponseMapper = (response: Response) => Response;

export function planningAuthErrorResponse(error: unknown) {
  if (!isPlanningAuthError(error)) return null;
  return jsonError(error.code, error.message, { status: error.status });
}

export async function withPlanningRouteUser<T>(
  request: Request,
  callback: (user: PlanningRouteUser) => T | Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
  mapAuthErrorResponse?: PlanningAuthErrorResponseMapper,
): Promise<T | Response> {
  try {
    const user = await requireCurrentPlanningUser(request, env);
    return runWithPlanningUserScope({ userId: user.id, authSource: user.source }, () => callback(user));
  } catch (error) {
    const response = planningAuthErrorResponse(error);
    if (response) return mapAuthErrorResponse ? mapAuthErrorResponse(response) : response;
    throw error;
  }
}

/**
 * @deprecated Route handlers should use withPlanningRouteUser(request, callback)
 * so auth and storage scope have one lifecycle.
 */
export async function requirePlanningRouteUser(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PlanningRouteUser | Response> {
  try {
    return await requireCurrentPlanningUser(request, env);
  } catch (error) {
    const response = planningAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/**
 * @deprecated Route handlers should not need a Response type guard when using
 * withPlanningRouteUser(request, callback).
 */
export function isPlanningRouteUser(value: PlanningRouteUser | Response): value is PlanningRouteUser {
  if (value instanceof Response) return false;
  return true;
}

export function planningUserMeta(user: PlanningRouteUser): Record<string, string> {
  return {
    userId: user.id,
    authSource: user.source,
  };
}
