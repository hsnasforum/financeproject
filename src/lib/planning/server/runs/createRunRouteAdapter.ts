import {
  requireCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../dev/devGuards";
import { jsonError, jsonOk } from "../../api/response";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../api/routeAuth";
import {
  planningDeprecatedApiMeta,
  withPlanningDeprecationHeaders,
  type PlanningDeprecatedApiPolicy,
} from "../../routes";
import {
  createPlanningRun,
  parseCreatePlanningRunCommand,
  recordCreatePlanningRunParseFailure,
  type RunsCreateBody,
} from "./createRunService";

type HandleCreatePlanningRunPostOptions = {
  deprecatedApi?: PlanningDeprecatedApiPolicy;
};

function routePolicyMeta(policy?: PlanningDeprecatedApiPolicy): Record<string, unknown> | undefined {
  if (!policy) return undefined;
  return {
    deprecatedApi: planningDeprecatedApiMeta(policy),
  };
}

function mergeRoutePolicyMeta(
  meta: Record<string, unknown>,
  policy?: PlanningDeprecatedApiPolicy,
): Record<string, unknown> {
  const policyMeta = routePolicyMeta(policy);
  return policyMeta
    ? {
      ...meta,
      ...policyMeta,
    }
    : meta;
}

function decorateDeprecatedResponse<T extends Response>(
  response: T,
  policy?: PlanningDeprecatedApiPolicy,
): T {
  return withPlanningDeprecationHeaders(response, policy);
}

function withWriteGuard(
  request: Request,
  body: { csrf?: unknown } | null,
  policy?: PlanningDeprecatedApiPolicy,
) {
  try {
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    requireCsrf(request, { csrf: csrfToken }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return decorateDeprecatedResponse(
        jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.", {
          meta: routePolicyMeta(policy),
        }),
        policy,
      );
    }
    return decorateDeprecatedResponse(
      jsonError(guard.code, guard.message, {
        status: guard.status,
        meta: routePolicyMeta(policy),
      }),
      policy,
    );
  }
}

export async function handleCreatePlanningRunPost(
  request: Request,
  options: HandleCreatePlanningRunPostOptions = {},
) {
  const deprecatedApi = options.deprecatedApi;
  let body: RunsCreateBody = null;
  try {
    body = (await request.json()) as RunsCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withWriteGuard(request, body, deprecatedApi);
  if (guardFailure) return guardFailure;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);

    const command = parseCreatePlanningRunCommand(body);
    if (!command.ok) {
      recordCreatePlanningRunParseFailure(command);
      return decorateDeprecatedResponse(
        jsonError(command.code, command.message, {
          ...(typeof command.status === "number" ? { status: command.status } : {}),
          ...(command.issues ? { issues: command.issues } : {}),
          meta: mergeRoutePolicyMeta(userMeta, deprecatedApi),
        }),
        deprecatedApi,
      );
    }

    const result = await createPlanningRun(command.command, {
      requestBaseUrl: new URL(request.url).origin,
    });

    if (result.ok) {
      return decorateDeprecatedResponse(
        jsonOk(result.payload, {
          status: result.status,
          meta: mergeRoutePolicyMeta(userMeta, deprecatedApi),
        }),
        deprecatedApi,
      );
    }

    return decorateDeprecatedResponse(
      jsonError(result.code, result.message, {
        ...(typeof result.status === "number" ? { status: result.status } : {}),
        ...(result.issues ? { issues: result.issues } : {}),
        meta: mergeRoutePolicyMeta({
          ...userMeta,
          ...(result.meta ?? {}),
        }, deprecatedApi),
      }),
      deprecatedApi,
    );
  }, process.env, (response) => decorateDeprecatedResponse(response, deprecatedApi));
}
