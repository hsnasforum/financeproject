import { getPlanningFeatureFlags } from "../../../../../lib/planning/config";
import { fail, ok } from "../../../../../lib/planning/server/v2/apiResponse";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { generateCandidatePlans } from "../../../../../lib/planning/server/v2/optimizer/greedy";
import { type RiskTolerance } from "../../../../../lib/planning/server/v2/scenarios";
import { createPlanningService } from "../../../../../lib/planning/server/v2/service";
import { toPlanningError } from "../../../../../lib/planning/server/v2/errors";
import { PlanningV2ValidationError, type ProfileV2 } from "../../../../../lib/planning/server/v2/types";
import { validateHorizonMonths, validateProfileV2 } from "../../../../../lib/planning/server/v2/validate";

type OptimizeRequestBody = {
  profile?: unknown;
  horizonMonths?: unknown;
  assumptions?: unknown;
  snapshotId?: unknown;
  constraints?: unknown;
  knobs?: unknown;
  search?: unknown;
  csrf?: unknown;
} | null;

const planningService = createPlanningService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toIssueMessages(error: PlanningV2ValidationError): string[] {
  return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function parseRiskTolerance(rawProfile: unknown): RiskTolerance {
  if (!isRecord(rawProfile)) return "mid";

  const direct = typeof rawProfile.riskTolerance === "string" ? rawProfile.riskTolerance.trim().toLowerCase() : "";
  if (direct === "low" || direct === "mid" || direct === "high") return direct;

  const nested = isRecord(rawProfile.risk) && typeof rawProfile.risk.riskTolerance === "string"
    ? rawProfile.risk.riskTolerance.trim().toLowerCase()
    : "";
  if (nested === "low" || nested === "mid" || nested === "high") return nested;

  return "mid";
}

function parseAssumptionsOverrides(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid assumptions overrides", [
      { path: "assumptions", message: "must be an object" },
    ]);
  }
  return value;
}

function parseSnapshotId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new PlanningV2ValidationError("Invalid snapshot id", [
      { path: "snapshotId", message: "must be a string" },
    ]);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "latest") return undefined;
  return trimmed;
}

function parseConstraints(input: unknown): {
  minEmergencyMonths: number;
  maxDebtServiceRatio?: number;
  minEndCashKrw?: number;
} {
  const obj = input === undefined ? {} : input;
  if (!isRecord(obj)) {
    throw new PlanningV2ValidationError("Invalid constraints", [
      { path: "constraints", message: "must be an object" },
    ]);
  }

  const minEmergencyMonthsRaw = obj.minEmergencyMonths ?? 3;
  if (!isFiniteNumber(minEmergencyMonthsRaw)) {
    throw new PlanningV2ValidationError("Invalid constraints", [
      { path: "constraints.minEmergencyMonths", message: "must be a finite number" },
    ]);
  }
  const minEmergencyMonths = Math.max(0, Math.trunc(minEmergencyMonthsRaw));

  let maxDebtServiceRatio: number | undefined;
  if (obj.maxDebtServiceRatio !== undefined) {
    if (!isFiniteNumber(obj.maxDebtServiceRatio)) {
      throw new PlanningV2ValidationError("Invalid constraints", [
        { path: "constraints.maxDebtServiceRatio", message: "must be a finite number" },
      ]);
    }
    maxDebtServiceRatio = Math.max(0, obj.maxDebtServiceRatio);
  }

  let minEndCashKrw: number | undefined;
  if (obj.minEndCashKrw !== undefined) {
    if (!isFiniteNumber(obj.minEndCashKrw)) {
      throw new PlanningV2ValidationError("Invalid constraints", [
        { path: "constraints.minEndCashKrw", message: "must be a finite number" },
      ]);
    }
    minEndCashKrw = Math.max(0, Math.trunc(obj.minEndCashKrw));
  }

  return {
    minEmergencyMonths,
    ...(isFiniteNumber(maxDebtServiceRatio) ? { maxDebtServiceRatio } : {}),
    ...(isFiniteNumber(minEndCashKrw) ? { minEndCashKrw } : {}),
  };
}

function parseKnobs(input: unknown): {
  maxMonthlyContributionKrw?: number;
  allowExtraDebtPayment?: boolean;
  allowInvestContribution?: boolean;
} {
  const obj = input === undefined ? {} : input;
  if (!isRecord(obj)) {
    throw new PlanningV2ValidationError("Invalid knobs", [
      { path: "knobs", message: "must be an object" },
    ]);
  }

  let maxMonthlyContributionKrw: number | undefined;
  if (obj.maxMonthlyContributionKrw !== undefined) {
    if (!isFiniteNumber(obj.maxMonthlyContributionKrw)) {
      throw new PlanningV2ValidationError("Invalid knobs", [
        { path: "knobs.maxMonthlyContributionKrw", message: "must be a finite number" },
      ]);
    }
    maxMonthlyContributionKrw = Math.max(0, Math.trunc(obj.maxMonthlyContributionKrw));
  }

  const allowExtraDebtPayment = typeof obj.allowExtraDebtPayment === "boolean"
    ? obj.allowExtraDebtPayment
    : undefined;
  const allowInvestContribution = typeof obj.allowInvestContribution === "boolean"
    ? obj.allowInvestContribution
    : undefined;

  return {
    ...(isFiniteNumber(maxMonthlyContributionKrw) ? { maxMonthlyContributionKrw } : {}),
    ...(typeof allowExtraDebtPayment === "boolean" ? { allowExtraDebtPayment } : {}),
    ...(typeof allowInvestContribution === "boolean" ? { allowInvestContribution } : {}),
  };
}

function parseSearch(input: unknown): {
  candidates: number;
  keepTop: number;
  seed?: number;
} {
  const obj = input === undefined ? {} : input;
  if (!isRecord(obj)) {
    throw new PlanningV2ValidationError("Invalid search options", [
      { path: "search", message: "must be an object" },
    ]);
  }

  const candidatesRaw = obj.candidates ?? 20;
  const keepTopRaw = obj.keepTop ?? 5;
  if (!isFiniteNumber(candidatesRaw)) {
    throw new PlanningV2ValidationError("Invalid search options", [
      { path: "search.candidates", message: "must be a finite number" },
    ]);
  }
  if (!isFiniteNumber(keepTopRaw)) {
    throw new PlanningV2ValidationError("Invalid search options", [
      { path: "search.keepTop", message: "must be a finite number" },
    ]);
  }
  const candidates = Math.max(1, Math.min(200, Math.trunc(candidatesRaw)));
  const keepTop = Math.max(1, Math.min(5, Math.trunc(keepTopRaw)));

  let seed: number | undefined;
  if (obj.seed !== undefined) {
    if (!isFiniteNumber(obj.seed)) {
      throw new PlanningV2ValidationError("Invalid search options", [
        { path: "search.seed", message: "must be a finite number" },
      ]);
    }
    seed = Math.trunc(obj.seed);
  }

  return {
    candidates,
    keepTop,
    ...(isFiniteNumber(seed) ? { seed } : {}),
  };
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    if (hasCsrfCookie(request) && csrfToken) {
      assertCsrf(request, { csrf: csrfToken });
    }
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      const normalized = toPlanningError(error);
      return fail(normalized.code, normalized.message);
    }
    const normalized = toPlanningError(guard);
    return fail(normalized.code, normalized.message, { status: guard.status });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  if (!getPlanningFeatureFlags().optimizerEnabled) {
    return fail("DISABLED", "Optimizer is disabled", { status: 403 });
  }

  let body: OptimizeRequestBody = null;
  try {
    body = (await request.json()) as OptimizeRequestBody;
  } catch {
    body = null;
  }

  if (!isRecord(body)) {
    return fail("INPUT");
  }
  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  let profile: ProfileV2;
  let horizonMonths: number;
  let assumptionsOverrides: Record<string, unknown>;
  let requestedSnapshotId: string | undefined;
  let constraints:
    ReturnType<typeof parseConstraints>;
  let knobs:
    ReturnType<typeof parseKnobs>;
  let search:
    ReturnType<typeof parseSearch>;
  let riskTolerance: RiskTolerance;
  try {
    riskTolerance = parseRiskTolerance(body.profile);
    profile = validateProfileV2(body.profile);
    horizonMonths = validateHorizonMonths(body.horizonMonths);
    assumptionsOverrides = parseAssumptionsOverrides(body.assumptions);
    requestedSnapshotId = parseSnapshotId(body.snapshotId);
    constraints = parseConstraints(body.constraints);
    knobs = parseKnobs(body.knobs);
    search = parseSearch(body.search);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return fail("INPUT", undefined, {
        issues: toIssueMessages(error),
      });
    }
    return fail("INPUT");
  }

  try {
    const context = await planningService.resolveAssumptionsContext({
      profile,
      riskTolerance,
      assumptionsOverridesRaw: assumptionsOverrides,
      requestedSnapshotId,
    });

    const candidates = generateCandidatePlans({
      profile,
      horizonMonths,
      baseAssumptions: context.assumptions,
      constraints,
      knobs,
      search,
    });

    return ok({
      candidates,
    }, {
      generatedAt: new Date().toISOString(),
      snapshot: context.snapshotMeta,
      health: context.health.summary,
    });
  } catch (error) {
    const normalized = toPlanningError(error);
    if (normalized.code === "SNAPSHOT_NOT_FOUND") {
      return fail("SNAPSHOT_NOT_FOUND", undefined, { status: 400 });
    }
    return fail(normalized.code, normalized.message);
  }
}
