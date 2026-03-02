import { fail, ok } from "../../../../../lib/planning/server/v2/apiResponse";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { getPlanningFeatureFlags } from "../../../../../lib/planning/server/config";
import { buildCacheKey } from "../../../../../lib/planning/server/cache/key";
import { getCache, recordCacheUsage, setCache } from "../../../../../lib/planning/server/cache/storage";
import { createPlanningService } from "../../../../../lib/planning/server/v2/service";
import { toPlanningError } from "../../../../../lib/planning/server/v2/errors";
import { isAllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/presets";
import { type AllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/types";
import { PlanningV2ValidationError, type ProfileV2, type SimulationResultV2 } from "../../../../../lib/planning/server/v2/types";
import { validateHorizonMonths, validateProfileV2 } from "../../../../../lib/planning/server/v2/validate";
import { type RiskTolerance } from "../../../../../lib/planning/server/v2/scenarios";

type ActionsRequestBody = {
  profile?: unknown;
  horizonMonths?: unknown;
  assumptions?: unknown;
  policyId?: unknown;
  snapshotId?: unknown;
  includeProducts?: unknown;
  maxCandidatesPerAction?: unknown;
  csrf?: unknown;
} | null;

const ACTIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIONS_PRODUCTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const planningService = createPlanningService();
type AssumptionsContext = Awaited<ReturnType<typeof planningService.resolveAssumptionsContext>>;

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

function parseIncludeProducts(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return false;
}

function parseMaxCandidates(value: unknown): number {
  if (value === undefined) return 5;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
    throw new PlanningV2ValidationError("Invalid includeProducts options", [
      { path: "maxCandidatesPerAction", message: "must be between 1 and 20" },
    ]);
  }
  return parsed;
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

function summarizePlan(plan: SimulationResultV2) {
  const first = plan.timeline[0];
  const last = plan.timeline[plan.timeline.length - 1];
  const worst = plan.timeline.reduce((min, row) => (row.liquidAssets < min.liquidAssets ? row : min), plan.timeline[0] ?? {
    month: 1,
    liquidAssets: 0,
  });

  return {
    startNetWorthKrw: first?.netWorth ?? 0,
    endNetWorthKrw: last?.netWorth ?? 0,
    worstCashMonthIndex: Math.max(0, (worst?.month ?? 1) - 1),
    worstCashKrw: worst?.liquidAssets ?? 0,
    warningsCount: plan.warnings.length,
    goalsMissedCount: plan.goalStatus.filter((goal) => !goal.achieved).length,
  };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ActionsRequestBody = null;
  try {
    body = (await request.json()) as ActionsRequestBody;
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
  let policyId: AllocationPolicyId;
  let requestedSnapshotId: string | undefined;
  let riskTolerance: RiskTolerance;
  let includeProducts = false;
  let maxCandidatesPerAction = 5;
  try {
    riskTolerance = parseRiskTolerance(body.profile);
    profile = validateProfileV2(body.profile);
    horizonMonths = validateHorizonMonths(body.horizonMonths);
    assumptionsOverrides = parseOverrides(body.assumptions);
    policyId = parsePolicyId(body.policyId);
    requestedSnapshotId = parseSnapshotId(body.snapshotId);
    includeProducts = parseIncludeProducts(body.includeProducts);
    maxCandidatesPerAction = parseMaxCandidates(body.maxCandidatesPerAction);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return fail("INPUT", undefined, { issues: toIssueMessages(error) });
    }
    return fail("INPUT");
  }
  const featureFlags = getPlanningFeatureFlags();
  if (includeProducts && !featureFlags.includeProductsEnabled) {
    return fail("INPUT", "서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.", { status: 400 });
  }

  let finalSimulationAssumptions: AssumptionsContext["simulationAssumptions"];
  let baseAssumptions: AssumptionsContext["assumptions"];
  let snapshotMeta: AssumptionsContext["snapshotMeta"];
  let health: AssumptionsContext["health"];
  let scenarioOverrideForCache: AssumptionsContext["scenarioOverrideForCache"];
  let snapshotId: string | undefined;
  try {
    const context = await planningService.resolveAssumptionsContext({
      profile,
      riskTolerance,
      assumptionsOverridesRaw: assumptionsOverrides,
      requestedSnapshotId,
    });
    finalSimulationAssumptions = context.simulationAssumptions;
    baseAssumptions = context.assumptions;
    snapshotMeta = context.snapshotMeta;
    health = context.health;
    scenarioOverrideForCache = context.scenarioOverrideForCache;
    snapshotId = context.snapshotId;
  } catch (error) {
    const normalized = toPlanningError(error);
    if (normalized.code === "SNAPSHOT_NOT_FOUND") {
      return fail("SNAPSHOT_NOT_FOUND", undefined, { status: 400 });
    }
    return fail(normalized.code, normalized.message);
  }

  const keyBundle = buildCacheKey({
    kind: "actions",
    profile,
    snapshotMeta,
    horizonMonths,
    baseAssumptions,
    overrides: scenarioOverrideForCache,
    options: {
      includeProducts,
      maxCandidatesPerAction,
      policyId,
      snapshotId: snapshotId ?? null,
    },
    riskTolerance,
  });
  const keyPrefix = keyBundle.key.slice(0, 8);

  try {
    const cached = await getCache<{
      meta: {
        generatedAt: string;
        snapshot: Record<string, unknown>;
        health: Record<string, unknown>;
      };
      data: Record<string, unknown>;
    }>("actions", keyBundle.key);
    if (cached) {
      await recordCacheUsage("actions", true).catch(() => undefined);
      return ok(cached.data.data, {
        ...cached.data.meta,
        cache: {
          hit: true,
          keyPrefix,
        },
      });
    }
    await recordCacheUsage("actions", false).catch(() => undefined);

    const plan = planningService.simulate(profile, finalSimulationAssumptions, horizonMonths, { policyId });
    const actions = planningService.buildActions({
      plan,
      profile,
      baseAssumptions,
      snapshotMeta: {
        asOf: snapshotMeta.asOf,
        missing: snapshotMeta.missing,
      },
    });
    const actionsWithCandidates = await planningService.attachCandidates(actions, {
      includeProducts,
      maxCandidatesPerAction,
      requestBaseUrl: new URL(request.url).origin,
    });

    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        snapshot: snapshotMeta,
        health: health.summary,
      },
      data: {
        planSummary: summarizePlan(plan),
        actions: actionsWithCandidates,
        healthWarnings: health.warnings,
      },
    };

    const ttlMs = includeProducts ? ACTIONS_PRODUCTS_CACHE_TTL_MS : ACTIONS_CACHE_TTL_MS;
    await setCache({
      version: 1,
      kind: "actions",
      key: keyBundle.key,
      createdAt: payload.meta.generatedAt,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      meta: {
        horizonMonths,
        assumptionsHash: keyBundle.assumptionsHash,
        optionsHash: keyBundle.optionsHash,
        snapshot: {
          asOf: snapshotMeta.asOf,
          fetchedAt: snapshotMeta.fetchedAt,
          missing: snapshotMeta.missing,
        },
      },
      data: payload,
    }).catch(() => undefined);

    return ok(payload.data, {
      ...payload.meta,
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
}
