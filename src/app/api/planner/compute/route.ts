import { clampPlannerAssumptions, computePlanner } from "@/lib/planner/compute";
import { jsonError, jsonOk } from "@/lib/http/apiResponse";
import { append as appendAuditLog } from "@/lib/audit/auditLogStore";
import { PlannerInputError, type PlannerAssumptions } from "@/lib/planner/types";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import {
  PLANNING_DEPRECATED_API_ROUTES,
  planningDeprecatedApiMeta,
  withPlanningDeprecationHeaders,
} from "@/lib/planning/routes";
import { issuesToApi as plannerIssuesToApi, parsePlannerInput } from "../../../../lib/schemas/plannerInput";

const LEGACY_PLANNER_COMPUTE_CONTRACT = PLANNING_DEPRECATED_API_ROUTES.plannerCompute;

function legacyComputeMeta() {
  return {
    legacyApi: planningDeprecatedApiMeta(LEGACY_PLANNER_COMPUTE_CONTRACT),
  };
}

function withLegacyComputeHeaders<T extends Response>(response: T): T {
  return withPlanningDeprecationHeaders(response, LEGACY_PLANNER_COMPUTE_CONTRACT);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseAssumptions(value: unknown): Partial<PlannerAssumptions> {
  if (!isObject(value)) return {};
  return {
    emergencyTargetMonths: asNumber(value.emergencyTargetMonths) ?? undefined,
    minEmergencyMonthsBeforeDebtExtra: asNumber(value.minEmergencyMonthsBeforeDebtExtra) ?? undefined,
    highInterestAprPctThreshold: asNumber(value.highInterestAprPctThreshold) ?? undefined,
    dsrWarnPct: asNumber(value.dsrWarnPct) ?? undefined,
    annualReturnPct: asNumber(value.annualReturnPct) ?? undefined,
    applyReturnToSimulation: typeof value.applyReturnToSimulation === "boolean" ? value.applyReturnToSimulation : undefined,
    maxSimMonths: asNumber(value.maxSimMonths) ?? undefined,
  };
}

function withComputeGuard(request: Request) {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.", { status: 500 });
    }
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function recordLegacyPlannerComputeTelemetry(meta: ReturnType<typeof planningUserMeta>): void {
  try {
    appendAuditLog({
      event: LEGACY_PLANNER_COMPUTE_CONTRACT.telemetryEvent,
      route: LEGACY_PLANNER_COMPUTE_CONTRACT.route,
      summary: "Legacy planner compute API called",
      details: {
        legacyApiId: LEGACY_PLANNER_COMPUTE_CONTRACT.id,
        status: LEGACY_PLANNER_COMPUTE_CONTRACT.status,
        canonicalRoute: LEGACY_PLANNER_COMPUTE_CONTRACT.canonicalRoute,
        replacement: LEGACY_PLANNER_COMPUTE_CONTRACT.replacement,
        userId: meta.userId,
        authSource: meta.authSource,
      },
    });
  } catch (error) {
    console.error("[planner/compute] failed to record legacy telemetry", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function POST(request: Request) {
  const guardFailure = withComputeGuard(request);
  if (guardFailure) return withLegacyComputeHeaders(guardFailure);

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const userMeta = planningUserMeta(currentUser);
      recordLegacyPlannerComputeTelemetry(userMeta);
      const body = await request.json().catch(() => ({}));
      const payload = isObject(body) ? body : {};

      const parsedInput = parsePlannerInput(payload.input);
      if (!parsedInput.ok) {
        return withLegacyComputeHeaders(
          jsonError("INPUT", "Invalid input", {
            issues: plannerIssuesToApi(parsedInput.issues),
            meta: {
              ...userMeta,
              ...legacyComputeMeta(),
            },
          }),
        );
      }

      const assumptions = clampPlannerAssumptions(parseAssumptions(payload.assumptions));
      const result = computePlanner(parsedInput.value, assumptions);

      return withLegacyComputeHeaders(
        jsonOk({
          result,
        }, {
          meta: {
            ...userMeta,
            ...legacyComputeMeta(),
          },
        }),
      );
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return withLegacyComputeHeaders(authError);

    if (error instanceof PlannerInputError) {
      return withLegacyComputeHeaders(
        jsonError("INPUT", error.message, {
          issues: error.issues,
          meta: legacyComputeMeta(),
        }),
      );
    }

    console.error("[planner/compute] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return withLegacyComputeHeaders(
      jsonError("INTERNAL", "Internal error", {
        meta: legacyComputeMeta(),
      }),
    );
  }
}
