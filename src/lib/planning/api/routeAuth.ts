import { jsonError } from "./response";
import {
  isPlanningAuthError,
  requireCurrentPlanningUser,
  type PlanningCurrentUser,
} from "../auth/currentUser";
import { enterPlanningUserScope, runWithPlanningUserScope } from "../store/userScope";

export type PlanningRouteUser = PlanningCurrentUser;

export function planningAuthErrorResponse(error: unknown) {
  if (!isPlanningAuthError(error)) return null;
  return jsonError(error.code, error.message, { status: error.status });
}

export async function withPlanningRouteUser<T>(
  request: Request,
  callback: (user: PlanningRouteUser) => T | Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const user = await requireCurrentPlanningUser(request, env);
  return runWithPlanningUserScope({ userId: user.id, authSource: user.source }, () => callback(user));
}

export async function requirePlanningRouteUser(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PlanningRouteUser | Response> {
  try {
    const user = await requireCurrentPlanningUser(request, env);
    enterPlanningUserScope({ userId: user.id, authSource: user.source });
    return user;
  } catch (error) {
    const response = planningAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export function isPlanningRouteUser(value: PlanningRouteUser | Response): value is PlanningRouteUser {
  if (value instanceof Response) return false;
  // Direct route guards call this after awaiting requirePlanningRouteUser();
  // refresh the scope in the caller context before storage helpers run.
  enterPlanningUserScope({ userId: value.id, authSource: value.source });
  return true;
}

export function planningUserMeta(user: PlanningRouteUser): Record<string, string> {
  return {
    userId: user.id,
    authSource: user.source,
  };
}
