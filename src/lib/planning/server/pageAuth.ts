import {
  isPlanningAuthError,
  requireCurrentPlanningUser,
  type PlanningCurrentUser,
} from "../auth/currentUser";
import { runWithPlanningUserScope } from "../store/userScope";

async function readCurrentPageRequest(): Promise<Request | undefined> {
  try {
    const { headers } = await import("next/headers");
    const incomingHeaders = await headers();
    const requestHeaders = new Headers();
    incomingHeaders.forEach((value, key) => {
      requestHeaders.set(key, value);
    });
    const host = requestHeaders.get("host") || "localhost";
    const protocol = requestHeaders.get("x-forwarded-proto") || "http";
    return new Request(`${protocol}://${host}/`, { headers: requestHeaders });
  } catch {
    return undefined;
  }
}

export async function withCurrentPlanningPageUser<T>(
  callback: (user: PlanningCurrentUser) => T | Promise<T>,
): Promise<T> {
  const user = await requireCurrentPlanningUser(await readCurrentPageRequest());
  return runWithPlanningUserScope({ userId: user.id, authSource: user.source }, () => callback(user));
}

export function toPlanningPageLoadMessage(error: unknown, fallback: string): string {
  if (isPlanningAuthError(error)) return error.message;
  return fallback;
}
