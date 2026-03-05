import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertLocalHost,
  requireCsrf,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";
import {
  findAssumptionsSnapshotId,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../../../../../lib/planning/server/assumptions/storage";
import {
  mergeAssumptionsWithProvenance,
  toAssumptionsOverridesFromRecord,
} from "../../../../../lib/planning/server/assumptions/overrides";
import { loadAssumptionsOverridesByProfile } from "../../../../../lib/planning/server/assumptions/overridesStorage";
import { appendEvent as appendOpsMetricEvent } from "../../../../../lib/ops/metrics/metricsStore";
import { mapSnapshotToAssumptionsV2, mapSnapshotToScenarioExtrasV2 } from "../../../../../lib/planning/server/assumptions/mapSnapshotToAssumptionsV2";
import { getPlanningFeatureFlags } from "../../../../../lib/planning/server/config";
import { DEFAULT_ASSUMPTIONS_V2 } from "../../../../../lib/planning/server/v2/defaults";
import {
  assessAssumptionsHealth,
  assessRiskAssumptionConsistency,
  combineAssumptionsHealth,
} from "../../../../../lib/planning/server/v2/assumptionsHealth";
import { isAllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/presets";
import { type AllocationPolicyId } from "../../../../../lib/planning/server/v2/policy/types";
import { runScenarios } from "../../../../../lib/planning/server/v2/runScenarios";
import { type AssumptionsV2, type RiskTolerance, toScenarioAssumptionsV2, toSimulationAssumptionsV2 } from "../../../../../lib/planning/server/v2/scenarios";
import { simulateMonthly } from "../../../../../lib/planning/server/v2/simulateMonthly";
import { runMonteCarlo } from "../../../../../lib/planning/server/v2/monteCarlo";
import { checkMonteCarloBudget } from "../../../../../lib/planning/server/v2/budget";
import { buildActionsFromPlan } from "../../../../../lib/planning/server/v2/actions/buildActions";
import { matchCandidates } from "../../../../../lib/planning/server/v2/actions/matchFinlifeCandidates";
import { computeDebtStrategy } from "../../../../../lib/planning/server/v2/debt/strategy";
import { getProfile } from "../../../../../lib/planning/server/store/profileStore";
import { createRun, getRun, listRuns } from "../../../../../lib/planning/server/store/runStore";
import { ensureRunActionPlan, getRunActionProgress, summarizeRunActionProgress } from "../../../../../lib/planning/server/store/runActionStore";
import { runStagePipeline } from "../../../../../lib/planning/v2/stagePipeline";
import { buildResultDtoV1 } from "../../../../../lib/planning/v2/resultDto";
import { preflightRun } from "../../../../../lib/planning/v2/preflight";
import { decimalToAprPct, toEngineRateBoundary } from "../../../../../lib/planning/v2/aprBoundary";
import { loadCanonicalProfile } from "../../../../../lib/planning/v2/loadCanonicalProfile";
import { buildRunReproducibilityMeta } from "../../../../../lib/planning/v2/reproducibility";
import { applyProfilePatch, type ScenarioPatch } from "../../../../../lib/planning/v2/profilePatch";
import { applyScenario, validateScenario, type ScenarioMeta, type ScenarioPatch as LegacyScenarioPatch } from "../../../../../lib/planning/v2/scenario";
import { DEFAULT_PLANNING_POLICY } from "../../../../../lib/planning/catalog/planningPolicy";
import { PlanningV2ValidationError, type ProfileV2, type SimulationResultV2, type TimelineRowV2 } from "../../../../../lib/planning/server/v2/types";
import { validateHorizonMonths } from "../../../../../lib/planning/server/v2/validate";
import { type LiabilityV2, type RefiOffer } from "../../../../../lib/planning/server/v2/debt/types";
import { type PlanningRunRecord, type PlanningRunStageResult } from "../../../../../lib/planning/store/types";
import {
  createEngineEnvelope,
  ENGINE_SCHEMA_VERSION,
  runPlanningEngine,
} from "../../../../../lib/planning/engine";

type RunsCreateBody = {
  profileId?: unknown;
  title?: unknown;
  scenario?: unknown;
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
    scenario?: unknown;
  } | null;
  csrf?: unknown;
} | null;

type RunInputScenario = NonNullable<PlanningRunRecord["input"]["scenario"]>;

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
    const csrfToken = typeof body?.csrf === "string" ? body.csrf.trim() : "";
    requireCsrf(request, { csrf: csrfToken }, { allowWhenCookieMissing: true });
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
  if (trimmed.toLowerCase() === "latest") return undefined;
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

function parseScenarioMeta(value: unknown): ScenarioMeta | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid scenario input", [
      { path: "scenario", message: "must be an object" },
    ]);
  }

  const name = asString(value.name);
  const createdAtRaw = asString(value.createdAt);
  const createdAt = createdAtRaw && Number.isFinite(Date.parse(createdAtRaw))
    ? new Date(createdAtRaw).toISOString()
    : new Date().toISOString();
  const id = asString(value.id) || crypto.randomUUID();
  const templateId = asString(value.templateId);
  const baselineRunId = asString(value.baselineRunId);
  const patchesRaw = value.patches;
  if (!Array.isArray(patchesRaw) || patchesRaw.length < 1) {
    throw new PlanningV2ValidationError("Invalid scenario input", [
      { path: "scenario.patches", message: "must be a non-empty array" },
    ]);
  }

  const patches: LegacyScenarioPatch[] = patchesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new PlanningV2ValidationError("Invalid scenario input", [
        { path: `scenario.patches[${index}]`, message: "must be an object" },
      ]);
    }
    const path = asString(entry.path);
    const op = asString(entry.op);
    const valueNumber = Number(entry.value);
    if (!path) {
      throw new PlanningV2ValidationError("Invalid scenario input", [
        { path: `scenario.patches[${index}].path`, message: "must be a non-empty string" },
      ]);
    }
    if (!(op === "set" || op === "add" || op === "multiply")) {
      throw new PlanningV2ValidationError("Invalid scenario input", [
        { path: `scenario.patches[${index}].op`, message: "must be one of set|add|multiply" },
      ]);
    }
    if (!Number.isFinite(valueNumber)) {
      throw new PlanningV2ValidationError("Invalid scenario input", [
        { path: `scenario.patches[${index}].value`, message: "must be a finite number" },
      ]);
    }
    return {
      path,
      op,
      value: valueNumber,
    };
  });

  return {
    id,
    name: name || "What-if scenario",
    ...(templateId ? { templateId } : {}),
    ...(baselineRunId ? { baselineRunId } : {}),
    createdAt,
    patches,
  };
}

function parseScenarioPatchInput(value: unknown, pathPrefix: string): ScenarioPatch {
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid scenario input", [
      { path: pathPrefix, message: "must be an object" },
    ]);
  }
  const opRaw = asString(value.op);
  const valueNumber = Number(value.value);
  if (!Number.isFinite(valueNumber)) {
    throw new PlanningV2ValidationError("Invalid scenario input", [
      { path: `${pathPrefix}.value`, message: "must be a finite number" },
    ]);
  }

  if (opRaw === "mul" || opRaw === "set") {
    const field = asString(value.field);
    if (
      field !== "monthlyIncomeNet"
      && field !== "monthlyEssentialExpenses"
      && field !== "monthlyDiscretionaryExpenses"
    ) {
      throw new PlanningV2ValidationError("Invalid scenario input", [
        {
          path: `${pathPrefix}.field`,
          message: "must be one of monthlyIncomeNet|monthlyEssentialExpenses|monthlyDiscretionaryExpenses",
        },
      ]);
    }
    return {
      op: opRaw,
      field: field as "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses",
      value: valueNumber,
    };
  }

  if (opRaw === "debt.mulMinimumPayment" || opRaw === "debt.setMinimumPayment") {
    const debtId = asString(value.debtId);
    if (!debtId) {
      throw new PlanningV2ValidationError("Invalid scenario input", [
        { path: `${pathPrefix}.debtId`, message: "must be a non-empty string" },
      ]);
    }
    return {
      op: opRaw,
      debtId,
      value: valueNumber,
    };
  }

  throw new PlanningV2ValidationError("Invalid scenario input", [
    {
      path: `${pathPrefix}.op`,
      message: "must be one of mul|set|debt.mulMinimumPayment|debt.setMinimumPayment",
    },
  ]);
}

function parseRunInputScenario(value: unknown): RunInputScenario | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    throw new PlanningV2ValidationError("Invalid scenario input", [
      { path: "input.scenario", message: "must be an object" },
    ]);
  }
  const title = asString(value.title);
  const baseRunId = asString(value.baseRunId);
  const patchRaw = value.patch;
  if (!Array.isArray(patchRaw) || patchRaw.length < 1) {
    throw new PlanningV2ValidationError("Invalid scenario input", [
      { path: "input.scenario.patch", message: "must be a non-empty array" },
    ]);
  }
  const patch = patchRaw.map((entry, index) => parseScenarioPatchInput(entry, `input.scenario.patch[${index}]`));
  return {
    ...(title ? { title } : {}),
    ...(baseRunId ? { baseRunId } : {}),
    patch,
  };
}

function scenarioPatchToLegacyPatch(
  patch: ScenarioPatch,
): { path: string; op: "set" | "multiply"; value: number } {
  if ("field" in patch) {
    return {
      path: `/${patch.field}`,
      op: patch.op === "set" ? "set" : "multiply",
      value: patch.value,
    };
  }
  return {
    path: `/debts/${patch.debtId}/minimumPayment`,
    op: patch.op === "debt.setMinimumPayment" ? "set" : "multiply",
    value: patch.value,
  };
}

function toLegacyScenarioMetaFromInput(inputScenario: RunInputScenario): ScenarioMeta {
  return {
    id: crypto.randomUUID(),
    name: inputScenario.title || "What-if scenario",
    ...(inputScenario.baseRunId ? { baselineRunId: inputScenario.baseRunId } : {}),
    createdAt: new Date().toISOString(),
    patches: inputScenario.patch.map((patch) => scenarioPatchToLegacyPatch(patch)),
  };
}

function legacyPatchToInputPatch(
  patch: { path: string; op: "set" | "add" | "multiply"; value: number },
): ScenarioPatch | null {
  const normalizedPath = asString(patch.path);
  if (patch.op === "add") return null;
  if (
    normalizedPath === "/monthlyIncomeNet"
    || normalizedPath === "/monthlyEssentialExpenses"
    || normalizedPath === "/monthlyDiscretionaryExpenses"
  ) {
    return {
      op: patch.op === "set" ? "set" : "mul",
      field: normalizedPath.slice(1) as "monthlyIncomeNet" | "monthlyEssentialExpenses" | "monthlyDiscretionaryExpenses",
      value: patch.value,
    };
  }
  const debtMatch = /^\/debts\/([^/]+)\/minimumPayment$/.exec(normalizedPath);
  if (debtMatch) {
    return {
      op: patch.op === "set" ? "debt.setMinimumPayment" : "debt.mulMinimumPayment",
      debtId: debtMatch[1],
      value: patch.value,
    };
  }
  return null;
}

function legacyScenarioToInputScenario(legacy: ScenarioMeta): RunInputScenario | undefined {
  const patch: ScenarioPatch[] = [];
  for (const entry of legacy.patches) {
    const converted = legacyPatchToInputPatch(entry);
    if (!converted) return undefined;
    patch.push(converted);
  }
  if (patch.length < 1) return undefined;
  return {
    ...(legacy.name ? { title: legacy.name } : {}),
    ...(legacy.baselineRunId ? { baseRunId: legacy.baselineRunId } : {}),
    patch,
  };
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
      let normalizedRate;
      try {
        normalizedRate = toEngineRateBoundary(entry.newAprPct, "newAprPct");
      } catch {
        throw new PlanningV2ValidationError("Invalid debtStrategy input", [
          {
            path: `input.debtStrategy.offers[${index}].newAprPct`,
            message: "must be 0, legacy decimal(0<x<=1), or percent(1<x<=100)",
          },
        ]);
      }
      return {
        liabilityId,
        newAprPct: normalizedRate.pct,
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
  aprPct?: number;
  apr?: number;
  remainingMonths?: number;
  repaymentType?: "amortizing" | "interestOnly";
}> }, fallbackMonths: number): LiabilityV2[] {
  return profile.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    type: debt.repaymentType === "interestOnly" ? "interestOnly" : "amortizing",
    principalKrw: Math.max(0, debt.balance),
    aprPct: isFiniteNumber(debt.aprPct) ? debt.aprPct : decimalToAprPct(debt.apr ?? 0),
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

function toEngineInput(profile: ProfileV2) {
  const debtBalance = profile.debts.reduce((total, debt) => {
    return total + (Number.isFinite(debt.balance) ? debt.balance : 0);
  }, 0);

  return {
    monthlyIncome: profile.monthlyIncomeNet,
    monthlyExpense: profile.monthlyEssentialExpenses + profile.monthlyDiscretionaryExpenses,
    age: profile.currentAge,
    liquidAssets: profile.liquidAssets,
    debtBalance,
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

function formatPreflightIssueLine(issue: {
  code: string;
  message: string;
  fixHint?: string;
}): string {
  if (issue.fixHint && issue.fixHint.trim().length > 0) {
    return `${issue.code}: ${issue.message} (${issue.fixHint})`;
  }
  return `${issue.code}: ${issue.message}`;
}

async function appendRunStageMetrics(input: {
  requestId: string;
  runId?: string;
  profileId: string;
  overallStatus: string;
  stages: PlanningRunStageResult[];
  totalDurationMs?: number;
}) {
  const tasks = input.stages.map((stage) => appendOpsMetricEvent({
    type: "RUN_STAGE",
    status: stage.status,
    ...(input.runId ? { runId: input.runId } : {}),
    stage: stage.id,
    ...(typeof stage.durationMs === "number" ? { durationMs: stage.durationMs } : {}),
    ...(stage.reason ? { errorCode: stage.reason } : {}),
  }));
  tasks.push(appendOpsMetricEvent({
    type: "RUN_PIPELINE",
    status: input.overallStatus,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(typeof input.totalDurationMs === "number" ? { durationMs: input.totalDurationMs } : {}),
  }));
  await Promise.allSettled(tasks);
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
    const progressSummaryByRunId: Record<string, ReturnType<typeof summarizeRunActionProgress>> = {};
    for (const run of runs) {
      try {
        const progress = await getRunActionProgress(run.id);
        if (!progress) continue;
        progressSummaryByRunId[run.id] = summarizeRunActionProgress(progress);
      } catch {
        continue;
      }
    }
    return jsonOk({ data: runs, meta: { actionProgressSummaryByRunId: progressSummaryByRunId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 조회에 실패했습니다.";
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
  const runRequestId = crypto.randomUUID();
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
  let scenarioInput: RunInputScenario | undefined;
  let scenarioMeta: ScenarioMeta | undefined;
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
    scenarioInput = parseRunInputScenario(inputRow.scenario);
    scenarioMeta = parseScenarioMeta(body.scenario);
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

  const scenarioBaselineRunId = scenarioInput?.baseRunId || scenarioMeta?.baselineRunId;
  if (scenarioBaselineRunId) {
    const baselineRun = await getRun(scenarioBaselineRunId);
    if (!baselineRun) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileId,
        message: "scenario baseline run not found",
      });
      return jsonError("INPUT", "scenario baseline runId를 찾을 수 없습니다.", {
        status: 400,
        issues: [`input.scenario.baseRunId: '${scenarioBaselineRunId}' not found`],
      });
    }
  }

  if (!scenarioInput && scenarioMeta) {
    scenarioInput = legacyScenarioToInputScenario(scenarioMeta);
  }

  let canonicalProfile = profileRecord.profile;
  let profileNormalization = {
    defaultsApplied: [],
    fixesApplied: [],
  } as ReturnType<typeof loadCanonicalProfile>["normalization"];
  try {
    const canonicalLoad = loadCanonicalProfile(profileRecord.profile, {
      offers: debtStrategyInput.offers,
    });
    canonicalProfile = canonicalLoad.profile;
    profileNormalization = canonicalLoad.normalization;
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileId,
        message: "profile canonicalization failed",
      });
      return jsonError("INPUT", error.message, {
        status: 400,
        issues: error.issues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileId,
      message: "profile canonicalization failed",
    });
    return jsonError("INTERNAL", "실행 저장 검증 중 오류가 발생했습니다.");
  }

  if (scenarioInput) {
    try {
      canonicalProfile = applyProfilePatch(canonicalProfile, scenarioInput.patch);
    } catch (error) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileId,
        message: "scenario apply failed",
      });
      if (error instanceof PlanningV2ValidationError) {
        return jsonError("INPUT", "scenario patch 검증에 실패했습니다.", {
          status: 400,
          issues: error.issues.map((issue) => `${issue.path}: ${issue.message}`),
        });
      }
      return jsonError("INPUT", error instanceof Error ? error.message : "scenario 적용에 실패했습니다.", {
        status: 400,
      });
    }
  } else if (scenarioMeta) {
    const scenarioIssues = validateScenario(canonicalProfile, scenarioMeta.patches);
    if (scenarioIssues.length > 0) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileId,
        message: "scenario validation failed",
      });
      return jsonError("INPUT", "scenario patch 검증에 실패했습니다.", {
        status: 400,
        issues: scenarioIssues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }
    try {
      canonicalProfile = applyScenario(canonicalProfile, scenarioMeta.patches);
    } catch (error) {
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileId,
        message: "scenario apply failed",
      });
      return jsonError("INPUT", error instanceof Error ? error.message : "scenario 적용에 실패했습니다.", {
        status: 400,
      });
    }
  }
  const debtLiabilities = toLiabilitiesFromProfile(canonicalProfile, horizonMonths);

  const preflightIssues = preflightRun({
    profile: canonicalProfile as unknown as Record<string, unknown>,
    selectedSnapshot: requestedSnapshotId
      ? { mode: "history", id: requestedSnapshotId }
      : { mode: "latest" },
    debtOffers: debtStrategyInput.offers.map((offer) => ({
      liabilityId: offer.liabilityId,
      newAprPct: offer.newAprPct,
      ...(typeof offer.feeKrw === "number" ? { feeKrw: offer.feeKrw } : {}),
    })),
    assumptionsOverride,
    ...(monteCarloConfig
      ? {
        monteCarlo: {
          enabled: true,
          paths: monteCarloConfig.paths,
          horizonMonths,
        },
      }
      : {}),
  });
  const preflightBlockIssues = preflightIssues.filter((issue) => issue.severity === "block");
  if (preflightBlockIssues.length > 0) {
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileId,
      message: `preflight blocked (${preflightBlockIssues.map((issue) => issue.code).join(", ")})`,
    });
    return jsonError("INPUT", "실행 저장 사전 점검에 실패했습니다.", {
      status: 400,
      issues: preflightBlockIssues.map((issue) => formatPreflightIssueLine(issue)),
      meta: {
        preflight: {
          blocks: preflightBlockIssues,
        },
      },
    });
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
        return jsonError("SNAPSHOT_NOT_FOUND", "snapshotId를 찾을 수 없습니다. latest 또는 /ops/assumptions 목록에서 선택하세요.", {
          status: 400,
          issues: [`input.snapshotId: '${requestedSnapshotId}' not found`],
        });
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

  let storedAssumptionsOverrides = [] as Awaited<ReturnType<typeof loadAssumptionsOverridesByProfile>>;
  try {
    storedAssumptionsOverrides = await loadAssumptionsOverridesByProfile(profileRecord.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assumptions overrides";
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileId,
      message,
    });
    return jsonError("INTERNAL", "저장된 가정 오버라이드 로드에 실패했습니다.", { status: 500 });
  }

  const mappedFromSnapshot = mapSnapshotToAssumptionsV2(snapshot);
  const mappedScenarioExtras = mapSnapshotToScenarioExtrasV2(snapshot);
  const simulationOverrides = toSimulationOverrides(assumptionsOverride);
  const snapshotAssumptions = toScenarioAssumptionsV2(
    {
      ...DEFAULT_ASSUMPTIONS_V2,
      ...mappedFromSnapshot,
    },
    mappedScenarioExtras.extra,
  );
  const requestAssumptionsOverrides = toAssumptionsOverridesFromRecord(assumptionsOverride, {
    reasonPrefix: "run assumptionsOverride",
  });
  const {
    effectiveAssumptions,
    appliedOverrides,
  } = mergeAssumptionsWithProvenance(
    snapshotAssumptions,
    [...storedAssumptionsOverrides, ...requestAssumptionsOverrides],
  );
  const baseAssumptions = {
    ...effectiveAssumptions,
    ...(simulationOverrides.debtRates ? { debtRates: simulationOverrides.debtRates } : {}),
  };
  const finalSimulationAssumptions = {
    ...toSimulationAssumptionsV2(baseAssumptions),
    ...(simulationOverrides.debtRates ? { debtRates: simulationOverrides.debtRates } : {}),
  };
  const riskTolerance = parseRiskTolerance(canonicalProfile as unknown);
  const snapshotMeta = buildSnapshotMeta(snapshot, snapshotId);
  const baseHealth = assessAssumptionsHealth({
    assumptions: baseAssumptions,
    snapshotMeta,
  });
  const riskWarnings = assessRiskAssumptionConsistency(riskTolerance, baseAssumptions);
  const health = combineAssumptionsHealth(baseHealth, [...riskWarnings, ...mappedScenarioExtras.warnings]);

  const monteCarloBudget = monteCarloConfig
    ? checkMonteCarloBudget({
      paths: monteCarloConfig.paths,
      horizonMonths,
    })
    : null;

  let plan: SimulationResultV2 | null = null;
  let scenariosResult: ReturnType<typeof runScenarios> | null = null;
  let monteCarloResult: ReturnType<typeof runMonteCarlo> | null = null;
  let actionsResult: Awaited<ReturnType<typeof matchCandidates>> | ReturnType<typeof buildActionsFromPlan> | null = null;
  let debtStrategyResult: ReturnType<typeof computeDebtStrategy> | null = null;
  let stages: PlanningRunStageResult[] = [];

  try {
    const pipeline = await runStagePipeline({
      simulate: {
        outputRefKey: "outputs.simulate",
        run: () => {
          plan = simulateMonthly(canonicalProfile, finalSimulationAssumptions, horizonMonths, { policyId });
          return plan;
        },
      },
      scenarios: {
        enabled: runScenariosEnabled,
        outputRefKey: "outputs.scenarios",
        run: () => {
          scenariosResult = runScenarios({
            profile: canonicalProfile,
            horizonMonths,
            baseAssumptions,
            riskTolerance,
            policyId,
          });
          return scenariosResult;
        },
      },
      monteCarlo: {
        enabled: Boolean(monteCarloConfig),
        ...(monteCarloConfig && monteCarloBudget && !monteCarloBudget.ok
          ? {
            preSkipped: {
              reason: "BUDGET_EXCEEDED" as const,
              message: monteCarloBudget.message,
            },
          }
          : {}),
        outputRefKey: "outputs.monteCarlo",
        run: () => {
          if (!monteCarloConfig) return null;
          monteCarloResult = runMonteCarlo({
            profile: canonicalProfile,
            horizonMonths,
            baseAssumptions,
            policyId,
            paths: monteCarloConfig.paths,
            seed: monteCarloConfig.seed,
            riskTolerance,
          });
          return monteCarloResult;
        },
      },
      actions: {
        enabled: getActionsEnabled,
        outputRefKey: "outputs.actions",
        run: async () => {
          if (!plan) {
            throw new Error("simulate result is not available");
          }
          const actionsBase = buildActionsFromPlan({
            plan,
            profile: canonicalProfile,
            baseAssumptions,
            snapshotMeta: {
              asOf: snapshot?.asOf,
              missing: !snapshot,
            },
            ...(monteCarloResult ? { monteCarlo: monteCarloResult } : {}),
          });
          actionsResult = includeProducts
            ? await matchCandidates(actionsBase, {
              includeProducts: true,
              requestBaseUrl: new URL(request.url).origin,
            })
            : actionsBase;
          return actionsResult;
        },
      },
      debtStrategy: {
        enabled: analyzeDebtEnabled,
        outputRefKey: "outputs.debtStrategy",
        run: () => {
          debtStrategyResult = computeDebtStrategy({
            liabilities: debtLiabilities,
            monthlyIncomeKrw: Math.max(
              0,
              canonicalProfile.cashflow?.monthlyIncomeKrw ?? canonicalProfile.monthlyIncomeNet,
            ),
            offers: debtStrategyInput.offers,
            options: debtStrategyInput.options,
            horizonMonths,
            nowMonthIndex: 0,
          });
          return debtStrategyResult;
        },
      },
    });

    stages = pipeline.stages;
    const simulatePlan = (plan ?? pipeline.outputs.simulate) as SimulationResultV2 | null;
    const scenariosOutput = (scenariosResult ?? pipeline.outputs.scenarios) as ReturnType<typeof runScenarios> | null;
    const monteCarloOutput = (monteCarloResult ?? pipeline.outputs.monteCarlo) as ReturnType<typeof runMonteCarlo> | null;
    const actionsOutput = (actionsResult ?? pipeline.outputs.actions) as Awaited<ReturnType<typeof matchCandidates>>
      | ReturnType<typeof buildActionsFromPlan>
      | null;
    const debtStrategyOutput = (debtStrategyResult ?? pipeline.outputs.debtStrategy) as ReturnType<typeof computeDebtStrategy> | null;
    if (!simulatePlan || pipeline.overallStatus === "FAILED") {
      await appendRunStageMetrics({
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: pipeline.overallStatus,
        stages,
        totalDurationMs: stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0),
      });
      appendRunAudit({
        event: "PLANNING_RUN_CREATE",
        route: "/api/planning/v2/runs",
        result: "ERROR",
        recordId: profileRecord.id,
        message: "simulate stage failed",
      });
      return jsonError("INTERNAL", "simulate 단계 실행에 실패했습니다.", {
        status: 500,
        meta: {
          overallStatus: pipeline.overallStatus,
          stages,
        },
      });
    }

    const runEngineResult = runPlanningEngine(toEngineInput(canonicalProfile));
    const runEngine = createEngineEnvelope({
      status: runEngineResult.status,
      decision: runEngineResult.decision,
    });

    const outputs = {
      engineSchemaVersion: ENGINE_SCHEMA_VERSION,
      engine: runEngine,
      simulate: {
        engine: runEngine,
        summary: summarizePlan(simulatePlan),
        warnings: simulatePlan.warnings.map((warning) => warning.reasonCode),
        goalsStatus: simulatePlan.goalStatus,
        keyTimelinePoints: pickKeyTimelinePoints(simulatePlan.timeline),
      },
      ...(scenariosOutput ? {
        scenarios: {
          table: [
            {
              id: "base",
              title: "Base",
              ...summarizeScenarioResult(scenariosOutput.base),
            },
            ...scenariosOutput.scenarios.map((entry) => ({
              id: entry.spec.id,
              title: entry.spec.title,
              ...summarizeScenarioResult(entry.result),
              diffVsBase: entry.diffVsBase.keyMetrics,
            })),
          ],
          shortWhyByScenario: Object.fromEntries(
            scenariosOutput.scenarios.map((entry) => [entry.spec.id, entry.diffVsBase.shortWhy]),
          ),
        },
      } : {}),
      ...(monteCarloOutput ? {
        monteCarlo: {
          probabilities: monteCarloOutput.probabilities,
          percentiles: monteCarloOutput.percentiles,
          notes: monteCarloOutput.notes,
        },
      } : {}),
      ...(Array.isArray(actionsOutput) ? {
        actions: {
          actions: actionsOutput,
        },
      } : {}),
      ...(debtStrategyOutput ? {
        debtStrategy: {
          summary: {
            debtServiceRatio: debtStrategyOutput.meta.debtServiceRatio,
            totalMonthlyPaymentKrw: debtStrategyOutput.meta.totalMonthlyPaymentKrw,
            warningsCount: debtStrategyOutput.warnings.length,
          },
          warnings: debtStrategyOutput.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
          summaries: debtStrategyOutput.summaries,
          ...(debtStrategyOutput.refinance ? { refinance: debtStrategyOutput.refinance } : {}),
          whatIf: debtStrategyOutput.whatIf,
        },
      } : {}),
    };

    const resultDto = buildResultDtoV1({
      generatedAt: new Date().toISOString(),
      policyId,
      meta: {
        snapshot: snapshotMeta,
        health: health.summary,
      },
      simulate: outputs.simulate,
      scenarios: outputs.scenarios,
      monteCarlo: outputs.monteCarlo,
      actions: outputs.actions,
      debt: outputs.debtStrategy,
    });
    const reproducibility = buildRunReproducibilityMeta({
      profile: canonicalProfile,
      assumptionsSnapshotId: snapshotId,
      assumptionsSnapshot: snapshot,
      effectiveAssumptions: baseAssumptions,
      appliedOverrides,
      policy: DEFAULT_PLANNING_POLICY,
    });
    const scenarioMetaForRecord = scenarioMeta ?? (scenarioInput ? toLegacyScenarioMetaFromInput(scenarioInput) : undefined);

    const created = await createRun({
      profileId: profileRecord.id,
      ...(title ? { title } : {}),
      ...(scenarioMetaForRecord ? { scenario: scenarioMetaForRecord } : {}),
      overallStatus: pipeline.overallStatus,
      stages,
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
        ...(scenarioInput ? { scenario: scenarioInput } : {}),
      },
      meta: {
        snapshot: snapshotMeta,
        normalization: profileNormalization,
        health: {
          warningsCodes: health.summary.warningCodes,
          criticalCount: health.summary.criticalCount,
          ...(typeof health.summary.snapshotStaleDays === "number"
            ? { snapshotStaleDays: health.summary.snapshotStaleDays }
            : {}),
        },
      },
      reproducibility,
      outputs: {
        resultDto,
        ...outputs,
      } as unknown as PlanningRunRecord["outputs"],
    }, {
      storeRawOutputs: asString(process.env.PLANNING_RUN_STORE_RAW_OUTPUTS).toLowerCase() === "true",
    });
    try {
      await ensureRunActionPlan(created);
    } catch (error) {
      console.error("[planning] failed to initialize action plan", error);
    }
    await appendRunStageMetrics({
      requestId: runRequestId,
      runId: created.id,
      profileId: profileRecord.id,
      overallStatus: pipeline.overallStatus,
      stages,
      totalDurationMs: stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0),
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
        normalization: profileNormalization,
        health: health.summary,
        overallStatus: pipeline.overallStatus,
        stages,
      },
      data: created,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 저장에 실패했습니다.";
    if (stages.length > 0) {
      await appendRunStageMetrics({
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: "FAILED",
        stages,
        totalDurationMs: stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0),
      });
    }
    appendRunAudit({
      event: "PLANNING_RUN_CREATE",
      route: "/api/planning/v2/runs",
      result: "ERROR",
      recordId: profileRecord.id,
      message,
    });
    return jsonError("INTERNAL", message, {
      status: 500,
      ...(stages.length > 0 ? { meta: { stages } } : {}),
    });
  }
}
