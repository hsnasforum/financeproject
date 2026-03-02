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
import { type RiskTolerance } from "../../../../../lib/planning/server/v2/scenarios";
import { createPlanningService } from "../../../../../lib/planning/server/v2/service";
import { toPlanningError } from "../../../../../lib/planning/server/v2/errors";
import { PlanningV2ValidationError } from "../../../../../lib/planning/server/v2/types";
import { isAllocationPolicyId, type AllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/presets";
import { validateHorizonMonths, validateProfileV2 } from "../../../../../lib/planning/server/v2/validate";

type SimulateRequestBody = {
  profile?: unknown;
  horizonMonths?: unknown;
  assumptions?: unknown;
  policyId?: unknown;
  snapshotId?: unknown;
  csrf?: unknown;
} | null;

const SIMULATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
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

  let body: SimulateRequestBody = null;
  try {
    body = (await request.json()) as SimulateRequestBody;
  } catch {
    body = null;
  }

  if (!isRecord(body)) {
    return fail("INPUT");
  }
  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  let profile: unknown;
  let horizonMonths: unknown;
  let assumptionsOverrides: Record<string, unknown>;
  let policyId: AllocationPolicyId;
  let requestedSnapshotId: string | undefined;
  let riskTolerance: RiskTolerance;
  try {
    riskTolerance = parseRiskTolerance(body.profile);
    profile = validateProfileV2(body.profile);
    horizonMonths = validateHorizonMonths(body.horizonMonths);
    assumptionsOverrides = parseAssumptionsOverrides(body.assumptions);
    policyId = parsePolicyId(body.policyId);
    requestedSnapshotId = parseSnapshotId(body.snapshotId);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return fail("INPUT", undefined, {
        issues: toIssueMessages(error),
      });
    }
    return fail("INPUT");
  }

  let finalAssumptions:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["simulationAssumptions"]
      : never;
  let baseAssumptions:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["assumptions"]
      : never;
  let snapshotMeta:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["snapshotMeta"]
      : never;
  let snapshotId: string | undefined;
  let health:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["health"]
      : never;
  let scenarioOverrideForCache:
    ReturnType<typeof planningService.resolveAssumptionsContext> extends Promise<infer T>
      ? T["scenarioOverrideForCache"]
      : never;
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
    finalAssumptions = context.simulationAssumptions;
    baseAssumptions = context.assumptions;
    snapshotMeta = context.snapshotMeta;
    snapshotId = context.snapshotId;
    health = context.health;
    scenarioOverrideForCache = context.scenarioOverrideForCache;
    taxPensionExplain = context.taxPensionExplain;
  } catch (error) {
    const normalized = toPlanningError(error);
    if (normalized.code === "SNAPSHOT_NOT_FOUND") {
      return fail("SNAPSHOT_NOT_FOUND", "snapshotId를 찾을 수 없습니다. latest 또는 /ops/assumptions 목록에서 선택하세요.", {
        status: 400,
        ...(requestedSnapshotId ? { issues: [`snapshotId: '${requestedSnapshotId}' not found`] } : {}),
      });
    }
    return fail(normalized.code, normalized.message);
  }

  const keyBundle = buildCacheKey({
    kind: "simulate",
    profile,
    snapshotMeta: snapshotMeta,
    horizonMonths,
    baseAssumptions,
    overrides: scenarioOverrideForCache,
    options: {
      mode: "single",
      policyId,
      snapshotId: snapshotId ?? null,
    },
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
    }>("simulate", keyBundle.key);
    if (cached) {
      await recordCacheUsage("simulate", true).catch(() => undefined);
      return ok(cached.data.data, {
        ...cached.data.meta,
        cache: {
          hit: true,
          keyPrefix,
        },
      });
    }
    await recordCacheUsage("simulate", false).catch(() => undefined);

    const result = planningService.simulate(profile, finalAssumptions, horizonMonths, { policyId });
    const payload = {
      data: {
        ...result,
        healthWarnings: health.warnings,
        precisionNotes: taxPensionExplain.notes,
      },
      meta: {
        generatedAt: new Date().toISOString(),
        snapshot: snapshotMeta,
        health: health.summary,
      },
    };

    await setCache({
      version: 1,
      kind: "simulate",
      key: keyBundle.key,
      createdAt: payload.meta.generatedAt,
      expiresAt: new Date(Date.now() + SIMULATE_CACHE_TTL_MS).toISOString(),
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
      return fail("INPUT", undefined, {
        issues: toIssueMessages(error),
      });
    }

    return fail("INTERNAL");
  }
}
