import {
  fail,
  ok } from "../../../../../lib/planning/server/v2/apiResponse";
import {
  assertLocalHost,
  toGuardErrorResponse,
  } from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { assertPlanningWriteGuard } from "../../../../../lib/planning/api/writeGuard";
import { getPlanningFeatureFlags } from "../../../../../lib/planning/server/config";
import { buildCacheKey } from "../../../../../lib/planning/server/cache/key";
import {
  readPlanningRouteCache,
  writePlanningRouteCache,
  } from "../../../../../lib/planning/server/cache/routeService";
import { checkMonteCarloBudget } from "../../../../../lib/planning/server/v2/budget";
import { recordMonteCarloBudgetRejection } from "../../../../../lib/planning/server/v2/monteCarloAuditRouteService";
import { toPlanningError } from "../../../../../lib/planning/server/v2/errors";
import { type RiskTolerance } from "../../../../../lib/planning/server/v2/scenarios";
import { isAllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/presets";
import { type AllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/types";
import {
  buildEnginePayloadFromProfile,
  resolveAssumptionsContextForProfile,
  type PlanningAssumptionsContext,
  } from "../../../../../lib/planning/server/v2/toEngineInput";
import { createPlanningService } from "../../../../../lib/planning/server/v2/service";
import { PlanningV2ValidationError,
  type ProfileV2 } from "../../../../../lib/planning/server/v2/types";
import { validateHorizonMonths,
  validateProfileV2 } from "../../../../../lib/planning/server/v2/validate";
import {
  planningUserMeta,
  withPlanningRouteUser,
} from "../../../../../lib/planning/api/routeAuth";

type MonteCarloRequestBody = {
  profile?: unknown;
  horizonMonths?: unknown;
  assumptions?: unknown;
  policyId?: unknown;
  snapshotId?: unknown;
  monteCarlo?: unknown;
  csrf?: unknown;
} | null;

const MONTE_CARLO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const planningService = createPlanningService();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function parseOverrides(value: unknown): Record<string, unknown> {
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

function parsePolicyId(value: unknown): AllocationPolicyId {
  if (value === undefined || value === null || value === "") return "balanced";
  if (!isAllocationPolicyId(value)) {
    throw new PlanningV2ValidationError("Invalid policyId", [
      { path: "policyId", message: "must be one of balanced|safety|growth" },
    ]);
  }
  return value;
}

function parseMonteCarloConfig(value: unknown): { paths: number; seed: number } {
  if (value === undefined) {
    return { paths: 2000, seed: 12345 };
  }
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "monteCarlo", message: "must be an object" },
    ]);
  }

  const pathsRaw = value.paths;
  const seedRaw = value.seed;
  const paths = pathsRaw === undefined ? 2000 : Math.trunc(Number(pathsRaw));
  const seed = seedRaw === undefined ? 12345 : Math.trunc(Number(seedRaw));

  if (!Number.isFinite(paths) || paths < 1 || paths > 20000) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "monteCarlo.paths", message: "must be between 1 and 20000" },
    ]);
  }
  if (!Number.isFinite(seed)) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "monteCarlo.seed", message: "must be a finite integer" },
    ]);
  }

  return {
    paths,
    seed: seed >>> 0,
  };
}

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertPlanningWriteGuard(request, body);
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

  let body: MonteCarloRequestBody = null;
  try {
    body = (await request.json()) as MonteCarloRequestBody;
  } catch {
    body = null;
  }

  if (!isRecord(body)) {
    return fail("INPUT");
  }
  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;
  return await withPlanningRouteUser(request, async (currentUser) => {
    const userMeta = planningUserMeta(currentUser);
    const featureFlags = getPlanningFeatureFlags();
    if (!featureFlags.monteCarloEnabled) {
      return fail("INPUT", "서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.", { status: 400 });
    }

    let profile: ProfileV2;
    let horizonMonths: number;
    let assumptionsOverrides: Record<string, unknown>;
    let policyId: AllocationPolicyId;
    let requestedSnapshotId: string | undefined;
    let riskTolerance: RiskTolerance;
    let monteCarloConfig: { paths: number; seed: number };
    try {
      riskTolerance = parseRiskTolerance(body.profile);
      profile = validateProfileV2(body.profile);
      horizonMonths = validateHorizonMonths(body.horizonMonths);
      assumptionsOverrides = parseOverrides(body.assumptions);
      policyId = parsePolicyId(body.policyId);
      requestedSnapshotId = parseSnapshotId(body.snapshotId);
      monteCarloConfig = parseMonteCarloConfig(body.monteCarlo);
    } catch (error) {
      if (error instanceof PlanningV2ValidationError) {
        return fail("INPUT", undefined, { issues: toIssueMessages(error) });
      }
      return fail("INPUT");
    }

    const budget = checkMonteCarloBudget({
      paths: monteCarloConfig.paths,
      horizonMonths,
    });
    if (!budget.ok) {
      recordMonteCarloBudgetRejection(budget);
      return fail("BUDGET_EXCEEDED", budget.message, {
        status: 400,
        meta: {
          budget: budget.data,
        },
      });
    }

    let baseAssumptions: PlanningAssumptionsContext["assumptions"];
    let snapshotMeta: PlanningAssumptionsContext["snapshotMeta"];
    let health: PlanningAssumptionsContext["health"];
    let scenarioOverrideForCache: PlanningAssumptionsContext["scenarioOverrideForCache"];
    let snapshotId: string | undefined;
    {
      const resolvedContext = await resolveAssumptionsContextForProfile({
        planningService,
        profile,
        riskTolerance,
        assumptionsOverridesRaw: assumptionsOverrides,
        requestedSnapshotId,
      });
      if (!resolvedContext.ok) {
        if (resolvedContext.error.code === "SNAPSHOT_NOT_FOUND") {
          return fail("SNAPSHOT_NOT_FOUND", undefined, { status: resolvedContext.error.status });
        }
        return fail(resolvedContext.error.code, resolvedContext.error.message);
      }
      baseAssumptions = resolvedContext.context.assumptions;
      snapshotMeta = resolvedContext.context.snapshotMeta;
      health = resolvedContext.context.health;
      scenarioOverrideForCache = resolvedContext.context.scenarioOverrideForCache;
      snapshotId = resolvedContext.context.snapshotId;
    }

    const keyBundle = buildCacheKey({
      kind: "monteCarlo",
      profile,
      snapshotMeta,
      horizonMonths,
      baseAssumptions,
      overrides: scenarioOverrideForCache,
      options: {
        paths: monteCarloConfig.paths,
        seed: monteCarloConfig.seed,
        policyId,
        snapshotId: snapshotId ?? null,
      },
      riskTolerance,
    });
    const keyPrefix = keyBundle.key.slice(0, 8);

    try {
      const cached = await readPlanningRouteCache<Record<string, unknown>>("monteCarlo", keyBundle.key);
      if (cached) {
        const { data } = buildEnginePayloadFromProfile(profile, () => cached.data);
        return ok(data, {
          ...cached.meta,
          ...userMeta,
          cache: {
            hit: true,
            keyPrefix,
          },
        });
      }

      const { data } = buildEnginePayloadFromProfile(
        profile,
        (engineResult) => ({
          baseAssumptionsUsed: baseAssumptions,
          monteCarlo: engineResult.core,
          healthWarnings: health.warnings,
        }),
        {
          runCore: () => planningService.monteCarlo({
            profile,
            horizonMonths,
            baseAssumptions,
            policyId,
            paths: monteCarloConfig.paths,
            seed: monteCarloConfig.seed,
            riskTolerance,
          }),
        },
      );

      const payload = {
        meta: {
          generatedAt: new Date().toISOString(),
          snapshot: snapshotMeta,
          health: health.summary,
        },
        data,
      };

      await writePlanningRouteCache({
        kind: "monteCarlo",
        keyBundle,
        horizonMonths,
        ttlMs: MONTE_CARLO_CACHE_TTL_MS,
        snapshotMeta,
        payload,
      });

      return ok(payload.data, {
        ...payload.meta,
        ...userMeta,
        cache: {
          hit: false,
          keyPrefix,
        },
      });
    } catch (error) {
      if (error instanceof PlanningV2ValidationError) {
        return fail("INPUT", undefined, { issues: toIssueMessages(error) });
      }
      return fail("INTERNAL");
    }
  });
}
