import { fail, ok } from "../../../../../lib/planning/server/v2/apiResponse";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { buildCacheKey } from "../../../../../lib/planning/server/cache/key";
import { getCache, recordCacheUsage, setCache } from "../../../../../lib/planning/server/cache/storage";
import { toPlanningError } from "../../../../../lib/planning/server/v2/errors";
import { type RiskTolerance } from "../../../../../lib/planning/server/v2/scenarios";
import { isAllocationPolicyId, type AllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/presets";
import { createPlanningService } from "../../../../../lib/planning/server/v2/service";
import { PlanningV2ValidationError, type ProfileV2, type SimulationResultV2, type TimelineRowV2 } from "../../../../../lib/planning/server/v2/types";
import { validateHorizonMonths, validateProfileV2 } from "../../../../../lib/planning/server/v2/validate";

type ScenariosRequestBody = {
  profile?: unknown;
  horizonMonths?: unknown;
  assumptions?: unknown;
  policyId?: unknown;
  snapshotId?: unknown;
  csrf?: unknown;
} | null;

const SCENARIOS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const planningService = createPlanningService();

type Presentation = {
  summary: {
    startNetWorth: number;
    endNetWorth: number;
    netWorthDelta: number;
    worstCashMonthIndex: number;
    worstCashKrw: number;
    goalsAchieved: number;
    warningsCount: number;
  };
  warnings: Array<{ reasonCode: string; message: string; month: number | null }>;
  goalsStatus: SimulationResultV2["goalStatus"];
  keyTimelinePoints: Array<{ monthIndex: number; row: TimelineRowV2 }>;
  timeline?: TimelineRowV2[];
};

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

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withLocalWriteGuard(request: Request, body: { csrf?: unknown } | null) {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    if (hasCsrfCookie(request)) {
      assertCsrf(request, body);
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

function pickKeyTimelinePoints(rows: TimelineRowV2[]): Array<{ monthIndex: number; row: TimelineRowV2 }> {
  if (rows.length === 0) return [];
  const candidates = [0, 12, rows.length - 1];
  const seen = new Set<number>();
  const out: Array<{ monthIndex: number; row: TimelineRowV2 }> = [];
  for (const index of candidates) {
    if (index < 0 || index >= rows.length || seen.has(index)) continue;
    seen.add(index);
    out.push({ monthIndex: index, row: rows[index] });
  }
  return out;
}

function pickWorstCash(rows: TimelineRowV2[]): { monthIndex: number; value: number } {
  if (rows.length === 0) return { monthIndex: 0, value: 0 };
  let worst = rows[0];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.liquidAssets < worst.liquidAssets) worst = row;
  }
  return {
    monthIndex: Math.max(0, worst.month - 1),
    value: worst.liquidAssets,
  };
}

function summarizeResult(result: SimulationResultV2, includeFullTimeline: boolean): Presentation {
  const first = result.timeline[0];
  const last = result.timeline[result.timeline.length - 1];
  const worst = pickWorstCash(result.timeline);

  return {
    summary: {
      startNetWorth: first?.netWorth ?? 0,
      endNetWorth: last?.netWorth ?? 0,
      netWorthDelta: (last?.netWorth ?? 0) - (first?.netWorth ?? 0),
      worstCashMonthIndex: worst.monthIndex,
      worstCashKrw: worst.value,
      goalsAchieved: result.goalStatus.filter((goal) => goal.achieved).length,
      warningsCount: result.warnings.length,
    },
    warnings: result.warnings.map((warning) => ({
      reasonCode: warning.reasonCode,
      message: warning.message,
      month: warning.month ?? null,
    })),
    goalsStatus: result.goalStatus,
    keyTimelinePoints: pickKeyTimelinePoints(result.timeline),
    ...(includeFullTimeline ? { timeline: result.timeline } : {}),
  };
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const includeFullTimeline = new URL(request.url).searchParams.get("full") === "1";

  let body: ScenariosRequestBody = null;
  try {
    body = (await request.json()) as ScenariosRequestBody;
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
  try {
    riskTolerance = parseRiskTolerance(body.profile);
    profile = validateProfileV2(body.profile);
    horizonMonths = validateHorizonMonths(body.horizonMonths);
    assumptionsOverrides = parseOverrides(body.assumptions);
    policyId = parsePolicyId(body.policyId);
    requestedSnapshotId = parseSnapshotId(body.snapshotId);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return fail("INPUT", undefined, { issues: toIssueMessages(error) });
    }
    return fail("INPUT");
  }

  let baseAssumptions:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["assumptions"]
      : never;
  let snapshotMeta:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["snapshotMeta"]
      : never;
  let health:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["health"]
      : never;
  let scenarioOverrideForCache:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["scenarioOverrideForCache"]
      : never;
  let snapshotId: string | undefined;
  let taxPensionExplain:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["taxPensionExplain"]
      : never;
  try {
    const context = await planningService.resolveAssumptionsContext({
      profile,
      riskTolerance,
      assumptionsOverridesRaw: assumptionsOverrides,
      requestedSnapshotId,
    });
    baseAssumptions = context.assumptions;
    snapshotMeta = context.snapshotMeta;
    health = context.health;
    scenarioOverrideForCache = context.scenarioOverrideForCache;
    snapshotId = context.snapshotId;
    taxPensionExplain = context.taxPensionExplain;
  } catch (error) {
    const normalized = toPlanningError(error);
    if (normalized.code === "SNAPSHOT_NOT_FOUND") {
      return fail("SNAPSHOT_NOT_FOUND", undefined, { status: 400 });
    }
    return fail(normalized.code, normalized.message);
  }

  const keyBundle = buildCacheKey({
    kind: "scenarios",
    profile,
    snapshotMeta,
    horizonMonths,
    baseAssumptions,
    overrides: scenarioOverrideForCache,
    options: {
      includeFullTimeline,
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
    }>("scenarios", keyBundle.key);
    if (cached) {
      await recordCacheUsage("scenarios", true).catch(() => undefined);
      return ok(cached.data.data, {
        ...cached.data.meta,
        cache: {
          hit: true,
          keyPrefix,
        },
      });
    }
    await recordCacheUsage("scenarios", false).catch(() => undefined);

    const { base, scenarios, specs } = planningService.scenarios({
      profile,
      horizonMonths,
      baseAssumptions,
      riskTolerance,
      policyId,
    });

    const baseSpec = specs.find((entry) => entry.id === "base");
    const baseView = summarizeResult(base, includeFullTimeline);

    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        snapshot: snapshotMeta,
        health: health.summary,
      },
      data: {
        healthWarnings: health.warnings,
        precisionNotes: taxPensionExplain.notes,
        base: {
          id: "base",
          title: "Base",
          assumptionsUsed: baseSpec?.assumptions ?? baseAssumptions,
          ...baseView,
        },
        scenarios: scenarios.map((scenario) => ({
          id: scenario.spec.id,
          title: scenario.spec.title,
          assumptionsUsed: scenario.spec.assumptions,
          diffVsBase: scenario.diffVsBase,
          ...summarizeResult(scenario.result, includeFullTimeline),
        })),
      },
    };

    await setCache({
      version: 1,
      kind: "scenarios",
      key: keyBundle.key,
      createdAt: payload.meta.generatedAt,
      expiresAt: new Date(Date.now() + SCENARIOS_CACHE_TTL_MS).toISOString(),
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
