import { clampPlannerAssumptions, computePlanner } from "@/lib/planner/compute";
import { jsonError, jsonOk } from "@/lib/http/apiResponse";
import { PlannerInputError, type PlannerAssumptions } from "@/lib/planner/types";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import {
  planningAuthErrorResponse as toAuthErrorResponse,
  planningUserMeta,
  withPlanningRouteUser,
} from "@/lib/planning/api/routeAuth";
import { issuesToApi as plannerIssuesToApi, parsePlannerInput } from "../../../../lib/schemas/plannerInput";

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

      return jsonOk({
        result,
      }, {
        meta: planningUserMeta(currentUser),
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
