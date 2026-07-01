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
import { issuesToApi as plannerIssuesToApi, parsePlannerInput } from "../../../../lib/schemas/plannerInput";

const LEGACY_PLANNER_COMPUTE_CONTRACT = {
  id: "planner-compute",
  status: "deprecated-compatibility",
  owner: "Planning Reports / Architecture",
  sunset: "TBD-after-telemetry-inventory",
  replacement: "planning-v2 run/report APIs",
  telemetryEvent: "legacy_planner_compute_called",
} as const;

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
      route: "/api/planner/compute",
      summary: "Legacy planner compute API called",
      details: {
        legacyApiId: LEGACY_PLANNER_COMPUTE_CONTRACT.id,
        status: LEGACY_PLANNER_COMPUTE_CONTRACT.status,
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
  if (guardFailure) return guardFailure;

  try {
    return await withPlanningRouteUser(request, async (currentUser) => {
      const body = await request.json().catch(() => ({}));
      const payload = isObject(body) ? body : {};

      const parsedInput = parsePlannerInput(payload.input);
      if (!parsedInput.ok) {
        return jsonError("INPUT", "Invalid input", {
          issues: plannerIssuesToApi(parsedInput.issues),
        });
      }

      const assumptions = clampPlannerAssumptions(parseAssumptions(payload.assumptions));
      const result = computePlanner(parsedInput.value, assumptions);
      const userMeta = planningUserMeta(currentUser);
      recordLegacyPlannerComputeTelemetry(userMeta);

      return jsonOk({
        result,
      }, {
        meta: {
          ...userMeta,
          legacyApi: LEGACY_PLANNER_COMPUTE_CONTRACT,
        },
      });
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) return authError;

    if (error instanceof PlannerInputError) {
      return jsonError("INPUT", error.message, { issues: error.issues });
    }

    console.error("[planner/compute] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("INTERNAL", "Internal error");
  }
}
