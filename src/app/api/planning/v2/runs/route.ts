import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/http/apiResponse";
import {
  findAssumptionsSnapshotId,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../../../../../lib/planning/server/assumptions/storage";
import { mapSnapshotToAssumptionsV2, mapSnapshotToScenarioExtrasV2 } from "../../../../../lib/planning/server/assumptions/mapSnapshotToAssumptionsV2";
import { getPlanningFeatureFlags } from "../../../../../lib/planning/server/config";
import { DEFAULT_ASSUMPTIONS_V2 } from "../../../../../lib/planning/server/v2/defaults";
import {
  assessAssumptionsHealth,
  assessRiskAssumptionConsistency,
  combineAssumptionsHealth,
} from "../../../../../lib/planning/server/v2/assumptionsHealth";
import { isAllocationPolicyId, type AllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/presets";
import { runScenarios } from "../../../../../lib/planning/server/v2/runScenarios";
import { type AssumptionsV2, type RiskTolerance, toScenarioAssumptionsV2 } from "../../../../../lib/planning/server/v2/scenarios";
import { simulateMonthly } from "../../../../../lib/planning/server/v2/simulateMonthly";
import { runMonteCarlo } from "../../../../../lib/planning/server/v2/monteCarlo";
import { checkMonteCarloBudget } from "../../../../../lib/planning/server/v2/budget";
import { buildActionsFromPlan } from "../../../../../lib/planning/server/v2/actions/buildActions";
import { matchCandidates } from "../../../../../lib/planning/server/v2/actions/matchFinlifeCandidates";
import { computeDebtStrategy } from "../../../../../lib/planning/server/v2/debt/strategy";
import { getProfile } from "../../../../../lib/planning/server/store/profileStore";
import { createRun, listRuns } from "../../../../../lib/planning/server/store/runStore";
import { PlanningV2ValidationError, type SimulationResultV2, type TimelineRowV2 } from "../../../../../lib/planning/server/v2/types";
import { validateHorizonMonths } from "../../../../../lib/planning/server/v2/validate";
import { type LiabilityV2, type RefiOffer } from "../../../../../lib/planning/server/v2/debt/types";

type RunsCreateBody = {
  profileId?: unknown;
  title?: unknown;
  input?: {
    horizonMonths?: unknown;
    policyId?: unknown;
    snapshotId?: unknown;
    assumptionsOverride?: unknown;
    runScenarios?: unknown;
    getActions?: unknown;
    analyzeDebt?: unknown;
    debtStrategy?: unknown;
    includeProducts?: unknown;
    monteCarlo?: unknown;
  } | null;
  csrf?: unknown;
} | null;

type SnapshotShape = Awaited<ReturnType<typeof loadLatestAssumptionsSnapshot>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCsrfCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").includes("dev_csrf=");
}

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
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
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function parseRiskTolerance(rawProfile: unknown): RiskTolerance {
  if (!isRecord(rawProfile)) return "mid";

  const direct = asString(rawProfile.riskTolerance).toLowerCase();
  if (direct === "low" || direct === "mid" || direct === "high") return direct;

  if (isRecord(rawProfile.risk)) {
    const nested = asString(rawProfile.risk.riskTolerance).toLowerCase();
    if (nested === "low" || nested === "mid" || nested === "high") return nested;
  }
  return "mid";
}

function parseAssumptionsOverride(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid assumptions override", [
      { path: "input.assumptionsOverride", message: "must be an object" },
    ]);
  }
  return value;
}

function parseSnapshotId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new PlanningV2ValidationError("Invalid snapshot id", [
      { path: "input.snapshotId", message: "must be a string" },
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
      { path: "input.policyId", message: "must be one of balanced|safety|growth" },
    ]);
  }
  return value;
}

function parseIncludeProducts(value: unknown): boolean {
  return value === true;
}

function parseRunScenarios(value: unknown): boolean {
  if (value === undefined) return true;
  return value !== false;
}

function parseGetActions(value: unknown): boolean {
  if (value === undefined) return true;
  return value !== false;
}

function parseAnalyzeDebt(value: unknown): boolean {
  if (value === undefined) return true;
  return value !== false;
}

function parseMonteCarloInput(value: unknown): { paths: number; seed: number } | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "input.monteCarlo", message: "must be an object" },
    ]);
  }

  const pathsRaw = value.paths;
  const seedRaw = value.seed;
  const paths = pathsRaw === undefined ? 2000 : Math.trunc(Number(pathsRaw));
  const seed = seedRaw === undefined ? 12345 : Math.trunc(Number(seedRaw));

  if (!Number.isFinite(paths) || paths < 1 || paths > 20000) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "input.monteCarlo.paths", message: "must be between 1 and 20000" },
    ]);
  }
  if (!Number.isFinite(seed)) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "input.monteCarlo.seed", message: "must be a finite integer" },
    ]);
  }

  return {
    paths,
    seed: seed >>> 0,
  };
}

function normalizeAprPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

function parseDebtStrategyInput(
  value: unknown,
): {
  offers: RefiOffer[];
  options?: { extraPaymentKrw?: number; compareTermsMonths?: number[] };
} {
  if (value === undefined || value === null) return { offers: [] };
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid debtStrategy input", [
      { path: "input.debtStrategy", message: "must be an object" },
    ]);
  }

  let offers: RefiOffer[] = [];
  if (value.offers !== undefined) {
    if (!Array.isArray(value.offers)) {
      throw new PlanningV2ValidationError("Invalid debtStrategy input", [
        { path: "input.debtStrategy.offers", message: "must be an array" },
      ]);
    }
    offers = value.offers.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          { path: `input.debtStrategy.offers[${index}]`, message: "must be an object" },
        ]);
      }
      const liabilityId = asString(entry.liabilityId);
      if (!liabilityId) {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          { path: `input.debtStrategy.offers[${index}].liabilityId`, message: "must be a non-empty string" },
        ]);
      }
      if (!isFiniteNumber(entry.newAprPct)) {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          { path: `input.debtStrategy.offers[${index}].newAprPct`, message: "must be a finite number" },
        ]);
      }
      if (entry.feeKrw !== undefined && (!isFiniteNumber(entry.feeKrw) || entry.feeKrw < 0)) {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          { path: `input.debtStrategy.offers[${index}].feeKrw`, message: "must be >= 0 when provided" },
        ]);
      }
      const title = asString(entry.title);
      return {
        liabilityId,
        newAprPct: entry.newAprPct,
        ...(entry.feeKrw !== undefined ? { feeKrw: Math.round(entry.feeKrw) } : {}),
        ...(title ? { title } : {}),
      };
    });
  }

  let options: { extraPaymentKrw?: number; compareTermsMonths?: number[] } | undefined;
  if (value.options !== undefined) {
    if (!isRecord(value.options)) {
      throw new PlanningV2ValidationError("Invalid debtStrategy input", [
        { path: "input.debtStrategy.options", message: "must be an object" },
      ]);
    }
    options = {};
    if (value.options.extraPaymentKrw !== undefined) {
      if (!isFiniteNumber(value.options.extraPaymentKrw) || value.options.extraPaymentKrw < 0) {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          { path: "input.debtStrategy.options.extraPaymentKrw", message: "must be >= 0" },
        ]);
      }
      options.extraPaymentKrw = Math.round(value.options.extraPaymentKrw);
    }
    if (value.options.compareTermsMonths !== undefined) {
      if (!Array.isArray(value.options.compareTermsMonths)) {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          { path: "input.debtStrategy.options.compareTermsMonths", message: "must be an array" },
        ]);
      }
      options.compareTermsMonths = value.options.compareTermsMonths.map((term, index) => {
        const parsed = Math.trunc(Number(term));
        if (!Number.isFinite(parsed) || parsed < 1) {
          throw new PlanningV2ValidationError("Invalid debtStrategy input", [
            { path: `input.debtStrategy.options.compareTermsMonths[${index}]`, message: "must be >= 1" },
          ]);
        }
        return parsed;
      });
    }
  }

  return {
    offers,
    ...(options ? { options } : {}),
  };
}

function toLiabilitiesFromProfile(profile: { debts: Array<{
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  apr?: number;
  remainingMonths?: number;
  repaymentType?: "amortizing" | "interestOnly";
}> }, fallbackMonths: number): LiabilityV2[] {
  return profile.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, debt.balance),
    aprPct: normalizeAprPct(debt.apr ?? 0),
    remainingMonths: Math.max(1, debt.remainingMonths ?? fallbackMonths),
    minimumPaymentKrw: Math.max(0, debt.minimumPayment),
  }));
}

function toSimulationOverrides(overrides: Record<string, unknown>): Partial<typeof DEFAULT_ASSUMPTIONS_V2> {
  const output: Partial<typeof DEFAULT_ASSUMPTIONS_V2> = {};
  if (isFiniteNumber(overrides.inflation)) output.inflation = overrides.inflation;
  if (isFiniteNumber(overrides.expectedReturn)) output.expectedReturn = overrides.expectedReturn;
  if (isRecord(overrides.debtRates)) output.debtRates = overrides.debtRates as Record<string, number>;

  if (!isFiniteNumber(output.inflation) && isFiniteNumber(overrides.inflationPct)) {
    output.inflation = overrides.inflationPct;
  }
  if (!isFiniteNumber(output.expectedReturn) && isFiniteNumber(overrides.investReturnPct)) {
    output.expectedReturn = overrides.investReturnPct;
  }

  return output;
}

function toScenarioExtras(overrides: Record<string, unknown>): Partial<Pick<AssumptionsV2, "cashReturnPct" | "withdrawalRatePct">> {
  return {
    ...(isFiniteNumber(overrides.cashReturnPct) ? { cashReturnPct: overrides.cashReturnPct } : {}),
    ...(isFiniteNumber(overrides.withdrawalRatePct) ? { withdrawalRatePct: overrides.withdrawalRatePct } : {}),
  };
}

function buildSnapshotMeta(snapshot: SnapshotShape, snapshotId?: string) {
  if (!snapshot) return { missing: true as const };
  return {
    ...(snapshotId ? { id: snapshotId } : {}),
    asOf: snapshot.asOf,
    fetchedAt: snapshot.fetchedAt,
    missing: false as const,
    warningsCount: snapshot.warnings.length,
    sourcesCount: snapshot.sources.length,
  };
}

function pickKeyTimelinePoints(rows: TimelineRowV2[]): Array<{ monthIndex: number; row: TimelineRowV2 }> {
  if (rows.length === 0) return [];
  const candidates = [0, 12, 24, rows.length - 1];
  const seen = new Set<number>();
  const out: Array<{ monthIndex: number; row: TimelineRowV2 }> = [];
  for (const index of candidates) {
    if (index < 0 || index >= rows.length || seen.has(index)) continue;
    seen.add(index);
    out.push({ monthIndex: index, row: rows[index] });
  }
  return out;
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
    netWorthDeltaKrw: (last?.netWorth ?? 0) - (first?.netWorth ?? 0),
    worstCashMonthIndex: Math.max(0, (worst?.month ?? 1) - 1),
    worstCashKrw: worst?.liquidAssets ?? 0,
    goalsAchievedCount: plan.goalStatus.filter((goal) => goal.achieved).length,
    goalsMissedCount: plan.goalStatus.filter((goal) => !goal.achieved).length,
    warningsCount: plan.warnings.length,
  };
}

function summarizeScenarioResult(result: SimulationResultV2) {
  const summary = summarizePlan(result);
  return {
    endNetWorthKrw: summary.endNetWorthKrw,
    worstCashMonthIndex: summary.worstCashMonthIndex,
    worstCashKrw: summary.worstCashKrw,
    goalsAchievedCount: summary.goalsAchievedCount,
    warningsCount: summary.warningsCount,
  };
}

function appendRunAudit(input: {
  event: "PLANNING_RUN_CREATE";
  route: string;
  result: "SUCCESS" | "ERROR";
  recordId?: string | null;
  message: string;
}) {
  try {
    appendAuditLog({
      event: input.event,
      route: input.route,
      summary: `${input.event} ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        recordId: input.recordId ?? null,
        message: input.message,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append planning run audit", error);
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const url = new URL(request.url);
  const profileId = asString(url.searchParams.get("profileId"));
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  try {
    const runs = await listRuns({
      ...(profileId ? { profileId } : {}),
      ...(limit !== null ? { limit: Number(limit) } : {}),
      ...(offset !== null ? { offset: Number(offset) } : {}),
    });
    return jsonOk({ data: runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 이력 조회에 실패했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: RunsCreateBody = null;
  try {
    body = (await request.json()) as RunsCreateBody;
  } catch {
    body = null;
  }

  const guardFailure = withLocalWriteGuard(request, body);
  if (guardFailure) return guardFailure;

  if (!isRecord(body) || !isRecord(body.input)) {
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      message: "invalid request body",
    });
    return jsonError("INPUT", "Invalid request body");
  }

  const profileId = asString(body.profileId);
  const title = asString(body.title);
  const inputRow = body.input;

  if (!profileId) {
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      message: "missing profileId",
    });
    return jsonError("INPUT", "profileId is required");
  }

  let horizonMonths: number;
  let policyId: AllocationPolicyId;
  let requestedSnapshotId: string | undefined;
  let assumptionsOverride: Record<string, unknown>;
  let runScenariosEnabled: boolean;
  let getActionsEnabled: boolean;
  let analyzeDebtEnabled: boolean;
  let debtStrategyInput: {
    offers: RefiOffer[];
    options?: { extraPaymentKrw?: number; compareTermsMonths?: number[] };
  };
  let includeProducts: boolean;
  let monteCarloConfig: { paths: number; seed: number } | undefined;
  try {
    horizonMonths = validateHorizonMonths(inputRow.horizonMonths);
    policyId = parsePolicyId(inputRow.policyId);
    requestedSnapshotId = parseSnapshotId(inputRow.snapshotId);
    assumptionsOverride = parseAssumptionsOverride(inputRow.assumptionsOverride);
    runScenariosEnabled = parseRunScenarios(inputRow.runScenarios);
    getActionsEnabled = parseGetActions(inputRow.getActions);
    analyzeDebtEnabled = parseAnalyzeDebt(inputRow.analyzeDebt);
    debtStrategyInput = parseDebtStrategyInput(inputRow.debtStrategy);
    includeProducts = parseIncludeProducts(inputRow.includeProducts);
    monteCarloConfig = parseMonteCarloInput(inputRow.monteCarlo);
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        message: "invalid run input",
      });
      return jsonError("INPUT", error.message, {
        issues: error.issues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      message: "invalid input",
    });
    return jsonError("INPUT", "Invalid input");
  }
  const featureFlags = getPlanningFeatureFlags();
  if (includeProducts && !featureFlags.includeProductsEnabled) {
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      message: "includeProducts disabled by server feature flag",
    });
    return jsonError("INPUT", "서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.", { status: 400 });
  }
  if (monteCarloConfig && !featureFlags.monteCarloEnabled) {
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      message: "monteCarlo disabled by server feature flag",
    });
    return jsonError("INPUT", "서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.", { status: 400 });
  }

  const profileRecord = await getProfile(profileId);
  if (!profileRecord) {
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileId,
      message: "profile not found",
    });
    return jsonError("NO_DATA", "프로필을 찾을 수 없습니다.");
  }

  let snapshot: SnapshotShape = null;
  let snapshotId: string | undefined;
  try {
    if (requestedSnapshotId) {
      snapshot = await loadAssumptionsSnapshotById(requestedSnapshotId);
      snapshotId = requestedSnapshotId;
      if (!snapshot) {
        appendRunAudit({
          event: "PLANNING_RUN_CREATE",
          route: "/api/planning/v2/runs",
          result: "ERROR",
          recordId: profileId,
          message: "snapshot not found",
        });
        return jsonError("SNAPSHOT_NOT_FOUND", "Requested snapshotId not found", { status: 400 });
      }
    } else {
      snapshot = await loadLatestAssumptionsSnapshot();
      snapshotId = snapshot ? await findAssumptionsSnapshotId(snapshot) : undefined;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assumptions snapshot";
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileId,
      message,
    });
    return jsonError("SNAPSHOT", message, { status: 500 });
  }

  const mappedFromSnapshot = mapSnapshotToAssumptionsV2(snapshot);
  const mappedScenarioExtras = mapSnapshotToScenarioExtrasV2(snapshot);
  const finalSimulationAssumptions = {
    ...DEFAULT_ASSUMPTIONS_V2,
    ...mappedFromSnapshot,
    ...toSimulationOverrides(assumptionsOverride),
  };
  const overrideScenarioExtras = toScenarioExtras(assumptionsOverride);
  const baseAssumptions = toScenarioAssumptionsV2(
    finalSimulationAssumptions,
    {
      ...mappedScenarioExtras.extra,
      ...overrideScenarioExtras,
    },
  );
  const riskTolerance = parseRiskTolerance(profileRecord.profile as unknown);
  const snapshotMeta = buildSnapshotMeta(snapshot, snapshotId);
  const baseHealth = assessAssumptionsHealth({
    assumptions: baseAssumptions,
    snapshotMeta,
  });
  const riskWarnings = assessRiskAssumptionConsistency(riskTolerance, baseAssumptions);
  const health = combineAssumptionsHealth(baseHealth, [...riskWarnings, ...mappedScenarioExtras.warnings]);

  if (monteCarloConfig) {
    const budget = checkMonteCarloBudget({
      paths: monteCarloConfig.paths,
      horizonMonths,
    });
    if (!budget.ok) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileRecord.id,
        message: budget.message,
      });
      return jsonError("BUDGET_EXCEEDED", budget.message, {
        status: 400,
        meta: {
          budget: budget.data,
        },
      });
    }
  }

  try {
    const plan = simulateMonthly(profileRecord.profile, finalSimulationAssumptions, horizonMonths, { policyId });
    const scenarios = runScenariosEnabled
      ? runScenarios({
        profile: profileRecord.profile,
        horizonMonths,
        baseAssumptions,
        riskTolerance,
        policyId,
      })
      : null;
    const monteCarlo = monteCarloConfig
      ? runMonteCarlo({
        profile: profileRecord.profile,
        horizonMonths,
        baseAssumptions,
        policyId,
        paths: monteCarloConfig.paths,
        seed: monteCarloConfig.seed,
        riskTolerance,
      })
      : null;

    const actionsBase = getActionsEnabled
      ? buildActionsFromPlan({
        plan,
        profile: profileRecord.profile,
        baseAssumptions,
        snapshotMeta: {
          asOf: snapshot?.asOf,
          missing: !snapshot,
        },
        ...(monteCarlo ? { monteCarlo } : {}),
      })
      : [];

    const actions = getActionsEnabled
      ? (includeProducts
        ? await matchCandidates(actionsBase, {
          includeProducts: true,
          requestBaseUrl: new URL(request.url).origin,
        })
        : actionsBase)
      : [];

    const debtStrategy = analyzeDebtEnabled
      ? computeDebtStrategy({
        liabilities: toLiabilitiesFromProfile(profileRecord.profile, horizonMonths),
        monthlyIncomeKrw: Math.max(
          0,
          profileRecord.profile.cashflow?.monthlyIncomeKrw ?? profileRecord.profile.monthlyIncomeNet,
        ),
        offers: debtStrategyInput.offers,
        options: debtStrategyInput.options,
        horizonMonths,
        nowMonthIndex: 0,
      })
      : null;

    const created = await createRun({
      profileId: profileRecord.id,
      ...(title ? { title } : {}),
      input: {
        horizonMonths,
        policyId,
        ...(snapshotId ? { snapshotId } : {}),
        ...(Object.keys(assumptionsOverride).length > 0 ? { assumptionsOverride: assumptionsOverride as Partial<AssumptionsV2> } : {}),
        ...(runScenariosEnabled !== true ? { runScenarios: runScenariosEnabled } : {}),
        ...(getActionsEnabled !== true ? { getActions: getActionsEnabled } : {}),
        ...(analyzeDebtEnabled !== true ? { analyzeDebt: analyzeDebtEnabled } : {}),
        ...(debtStrategyInput.offers.length > 0 || debtStrategyInput.options
          ? { debtStrategy: debtStrategyInput }
          : {}),
        ...(includeProducts ? { includeProducts: true } : {}),
        ...(monteCarloConfig ? { monteCarlo: monteCarloConfig } : {}),
      },
      meta: {
        snapshot: snapshotMeta,
        health: {
          warningsCodes: health.summary.warningCodes,
          criticalCount: health.summary.criticalCount,
          ...(typeof health.summary.snapshotStaleDays === "number"
            ? { snapshotStaleDays: health.summary.snapshotStaleDays }
            : {}),
        },
      },
      outputs: {
        simulate: {
          summary: summarizePlan(plan),
          warnings: plan.warnings.map((warning) => warning.reasonCode),
          goalsStatus: plan.goalStatus,
          keyTimelinePoints: pickKeyTimelinePoints(plan.timeline),
        },
        ...(scenarios ? {
          scenarios: {
            table: [
              {
                id: "base",
                title: "Base",
                ...summarizeScenarioResult(scenarios.base),
              },
              ...scenarios.scenarios.map((entry) => ({
                id: entry.spec.id,
                title: entry.spec.title,
                ...summarizeScenarioResult(entry.result),
                diffVsBase: entry.diffVsBase.keyMetrics,
              })),
            ],
            shortWhyByScenario: Object.fromEntries(
              scenarios.scenarios.map((entry) => [entry.spec.id, entry.diffVsBase.shortWhy]),
            ),
          },
        } : {}),
        ...(monteCarlo ? {
          monteCarlo: {
            probabilities: monteCarlo.probabilities,
            percentiles: monteCarlo.percentiles,
            notes: monteCarlo.notes,
          },
        } : {}),
        ...(getActionsEnabled ? {
          actions: {
          actions,
          },
        } : {}),
        ...(debtStrategy ? {
          debtStrategy: {
            summary: {
              debtServiceRatio: debtStrategy.meta.debtServiceRatio,
              totalMonthlyPaymentKrw: debtStrategy.meta.totalMonthlyPaymentKrw,
              warningsCount: debtStrategy.warnings.length,
            },
            warnings: debtStrategy.warnings.map((warning) => ({
              code: warning.code,
              message: warning.message,
            })),
            summaries: debtStrategy.summaries,
            ...(debtStrategy.refinance ? { refinance: debtStrategy.refinance } : {}),
            whatIf: debtStrategy.whatIf,
          },
        } : {}),
      },
    });

    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "SUCCESS",
      recordId: created.id,
      message: "planning run created",
    });

    return jsonOk({
      meta: {
        generatedAt: new Date().toISOString(),
        snapshot: snapshotMeta,
        health: health.summary,
      },
      data: created,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 이력 저장에 실패했습니다.";
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileRecord.id,
      message,
    });
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
