import {
  requireCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../dev/devGuards";
import { jsonError, jsonOk } from "../../api/response";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "../../api/routeAuth";
import {
  createPlanningRun,
  parseCreatePlanningRunCommand,
  recordCreatePlanningRunParseFailure,
  type RunsCreateBody,
} from "./createRunService";

function withWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    requireCsrf(request, { csrf: csrfToken }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

export async function handleCreatePlanningRunPost(request: Request) {
  let body: RunsCreateBody = null;
  try {
    body = (await request.json()) as RunsCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body);
  if (guardFailure) return guardFailure;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const command = parseCreatePlanningRunCommand(body);
  if (!command.ok) {
    recordCreatePlanningRunParseFailure(command);
    return jsonError(command.code, command.message, {
      ...(typeof command.status === "number" ? { status: command.status } : {}),
      ...(command.issues ? { issues: command.issues } : {}),
      meta: userMeta,
    });
  }

  const result = await createPlanningRun(command.command, {
    requestBaseUrl: new URL(request.url).origin,
  });

  if (result.ok) {
    return jsonOk(result.payload, { status: result.status, meta: userMeta });
  }

  return jsonError(result.code, result.message, {
    ...(typeof result.status === "number" ? { status: result.status } : {}),
    ...(result.issues ? { issues: result.issues } : {}),
    meta: {
      ...userMeta,
      ...(result.meta ?? {}),
    },
  });
}
