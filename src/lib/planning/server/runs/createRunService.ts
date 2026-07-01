import { getPlanningFeatureFlags } from "../config";
import {
  PlanningRunAssumptionsResolveError,
  resolvePlanningRunAssumptions,
} from "../v2/runAssumptionsRouteService";
import { isAllocationPolicyId } from "../v2/policy/presets";
import { type AllocationPolicyId } from "../v2/policy/types";
import { runScenarios } from "../v2/runScenarios";
import { type AssumptionsV2, type RiskTolerance } from "../v2/scenarios";
import { simulateMonthly } from "../v2/simulateMonthly";
import { runMonteCarlo } from "../v2/monteCarlo";
import { checkMonteCarloBudget } from "../v2/budget";
import { buildActionsFromPlan } from "../v2/actions/buildActions";
import { matchCandidates } from "../v2/actions/matchFinlifeCandidates";
import { computeDebtStrategy } from "../v2/debt/strategy";
import { type LiabilityV2, type RefiOffer } from "../v2/debt/types";
import { buildPlanningRunArtifacts } from "../v2/runArtifacts";
import { PlanningV2ValidationError, type SimulationResultV2 } from "../v2/types";
import { validateHorizonMonths } from "../v2/validate";
import {
  createCurrentUserRunResponseData,
  getCurrentUserRunForRoute,
  getCurrentUserRunProfileForRoute,
  recordCurrentUserRunCreateAudit,
  recordCurrentUserRunStageMetrics,
  type CurrentUserRunRecord,
  type CurrentUserRunStageResult,
} from "./routeService";
import { runStagePipeline } from "../../v2/stagePipeline";
import { preflightRun } from "../../v2/preflight";
import { decimalToAprPct, toEngineRateBoundary } from "../../v2/aprBoundary";
import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { buildRunReproducibilityMeta } from "../../v2/reproducibility";
import { applyProfilePatch, type ScenarioPatch } from "../../v2/profilePatch";
import { roundKrw } from "../../calc/roundingPolicy";
import {
  applyScenario,
  validateScenario,
  type ScenarioMeta,
  type ScenarioPatch as LegacyScenarioPatch,
} from "../../v2/scenario";
import { DEFAULT_PLANNING_POLICY } from "../../catalog/planningPolicy";

export type RunsCreateBody = {
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

type RunInputScenario = NonNullable<CurrentUserRunRecord["input"]["scenario"]>;

export type CreatePlanningRunCommand = {
  profileId: string;
  runRequestId: string;
  title: string;
  horizonMonths: number;
  policyId: AllocationPolicyId;
  requestedSnapshotId?: string;
  assumptionsOverride: Record<string, unknown>;
  runScenariosEnabled: boolean;
  getActionsEnabled: boolean;
  analyzeDebtEnabled: boolean;
  debtStrategyInput: {
    offers: RefiOffer[];
    options?: { extraPaymentKrw?: number; compareTermsMonths?: number[] };
  };
  includeProducts: boolean;
  monteCarloConfig?: { paths: number; seed: number };
  scenarioInput?: RunInputScenario;
  scenarioMeta?: ScenarioMeta;
};

export type CreatePlanningRunContext = {
  requestBaseUrl: string;
};

export type CreatePlanningRunParseResult =
  | { ok: true; command: CreatePlanningRunCommand }
  | {
    ok: false;
    code: string;
    message: string;
    status?: number;
    issues?: string[];
    auditMessage: string;
    recordId?: string | null;
  };

export type CreatePlanningRunResult =
  | {
    ok: true;
    status: number;
    payload: {
      meta: Record<string, unknown>;
      data: CurrentUserRunRecord;
    };
  }
  | {
    ok: false;
    code: string;
    message: string;
    status?: number;
    issues?: string[];
    meta?: Record<string, unknown>;
  };

export type CreatePlanningRunParseDependencies = {
  randomUUID?: () => string;
  now?: () => Date;
};

export type CreatePlanningRunDependencies = {
  getFeatureFlags?: typeof getPlanningFeatureFlags;
  getProfile?: typeof getCurrentUserRunProfileForRoute;
  getRun?: typeof getCurrentUserRunForRoute;
  resolveAssumptions?: typeof resolvePlanningRunAssumptions;
  runPipeline?: typeof runStagePipeline;
  matchCandidatesProvider?: typeof matchCandidates;
  createRunRecord?: typeof createCurrentUserRunResponseData;
  recordAudit?: typeof recordCurrentUserRunCreateAudit;
  recordStageMetrics?: typeof recordCurrentUserRunStageMetrics;
  randomUUID?: () => string;
  now?: () => Date;
};

type ResolvedCreatePlanningRunDependencies = Required<CreatePlanningRunDependencies>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function parseScenarioMeta(
  value: unknown,
  dependencies: Required<CreatePlanningRunParseDependencies>,
): ScenarioMeta | undefined {
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
    : dependencies.now().toISOString();
  const id = asString(value.id) || dependencies.randomUUID();
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

function toLegacyScenarioMetaFromInput(
  inputScenario: RunInputScenario,
  dependencies: Required<CreatePlanningRunParseDependencies>,
): ScenarioMeta {
  return {
    id: dependencies.randomUUID(),
    name: inputScenario.title || "What-if scenario",
    ...(inputScenario.baseRunId ? { baselineRunId: inputScenario.baseRunId } : {}),
    createdAt: dependencies.now().toISOString(),
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
        ...(entry.feeKrw !== undefined ? { feeKrw: roundKrw(entry.feeKrw) } : {}),
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
      options.extraPaymentKrw = roundKrw(value.options.extraPaymentKrw);
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

function resolveParseDependencies(
  dependencies: CreatePlanningRunParseDependencies = {},
): Required<CreatePlanningRunParseDependencies> {
  return {
    randomUUID: dependencies.randomUUID ?? (() => crypto.randomUUID()),
    now: dependencies.now ?? (() => new Date()),
  };
}

function resolveCreateDependencies(
  dependencies: CreatePlanningRunDependencies = {},
): ResolvedCreatePlanningRunDependencies {
  return {
    getFeatureFlags: dependencies.getFeatureFlags ?? getPlanningFeatureFlags,
    getProfile: dependencies.getProfile ?? getCurrentUserRunProfileForRoute,
    getRun: dependencies.getRun ?? getCurrentUserRunForRoute,
    resolveAssumptions: dependencies.resolveAssumptions ?? resolvePlanningRunAssumptions,
    runPipeline: dependencies.runPipeline ?? runStagePipeline,
    matchCandidatesProvider: dependencies.matchCandidatesProvider ?? matchCandidates,
    createRunRecord: dependencies.createRunRecord ?? createCurrentUserRunResponseData,
    recordAudit: dependencies.recordAudit ?? recordCurrentUserRunCreateAudit,
    recordStageMetrics: dependencies.recordStageMetrics ?? recordCurrentUserRunStageMetrics,
    randomUUID: dependencies.randomUUID ?? (() => crypto.randomUUID()),
    now: dependencies.now ?? (() => new Date()),
  };
}

function validationIssues(error: PlanningV2ValidationError): string[] {
  return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

export function parseCreatePlanningRunCommand(
  body: RunsCreateBody,
  dependencies?: CreatePlanningRunParseDependencies,
): CreatePlanningRunParseResult {
  const deps = resolveParseDependencies(dependencies);
  if (!isRecord(body) || !isRecord(body.input)) {
    return {
      ok: false,
      code: "INPUT",
      message: "Invalid request body",
      auditMessage: "invalid request body",
    };
  }

  const profileId = asString(body.profileId);
  const runRequestId = deps.randomUUID();
  const title = asString(body.title);
  const inputRow = body.input;

  if (!profileId) {
    return {
      ok: false,
      code: "INPUT",
      message: "profileId is required",
      auditMessage: "missing profileId",
    };
  }

  try {
    return {
      ok: true,
      command: {
        profileId,
        runRequestId,
        title,
        horizonMonths: validateHorizonMonths(inputRow.horizonMonths),
        policyId: parsePolicyId(inputRow.policyId),
        requestedSnapshotId: parseSnapshotId(inputRow.snapshotId),
        assumptionsOverride: parseAssumptionsOverride(inputRow.assumptionsOverride),
        runScenariosEnabled: parseRunScenarios(inputRow.runScenarios),
        getActionsEnabled: parseGetActions(inputRow.getActions),
        analyzeDebtEnabled: parseAnalyzeDebt(inputRow.analyzeDebt),
        debtStrategyInput: parseDebtStrategyInput(inputRow.debtStrategy),
        includeProducts: parseIncludeProducts(inputRow.includeProducts),
        monteCarloConfig: parseMonteCarloInput(inputRow.monteCarlo),
        scenarioInput: parseRunInputScenario(inputRow.scenario),
        scenarioMeta: parseScenarioMeta(body.scenario, deps),
      },
    };
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return {
        ok: false,
        code: "INPUT",
        message: error.message,
        issues: validationIssues(error),
        auditMessage: "invalid run input",
      };
    }
    return {
      ok: false,
      code: "INPUT",
      message: "Invalid input",
      auditMessage: "invalid input",
    };
  }
}

function errorResult(input: {
  code: string;
  message: string;
  status?: number;
  issues?: string[];
  meta?: Record<string, unknown>;
}): CreatePlanningRunResult {
  return {
    ok: false,
    code: input.code,
    message: input.message,
    ...(typeof input.status === "number" ? { status: input.status } : {}),
    ...(input.issues ? { issues: input.issues } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };
}

function recordCreateAudit(
  dependencies: ResolvedCreatePlanningRunDependencies,
  input: {
    result: "SUCCESS" | "ERROR";
    recordId?: string | null;
    message: string;
  },
) {
  try {
    dependencies.recordAudit({
      result: input.result,
      recordId: input.recordId,
      message: input.message,
    });
  } catch (error) {
    console.error("[planning/runs] failed to record create audit", error);
  }
}

async function recordStageMetricsSafely(
  dependencies: ResolvedCreatePlanningRunDependencies,
  input: Parameters<typeof recordCurrentUserRunStageMetrics>[0],
) {
  try {
    await dependencies.recordStageMetrics(input);
  } catch (error) {
    console.error("[planning/runs] failed to record stage metrics", error);
  }
}

export function recordCreatePlanningRunParseFailure(
  parseFailure: Exclude<CreatePlanningRunParseResult, { ok: true }>,
  dependencies?: Pick<CreatePlanningRunDependencies, "recordAudit">,
) {
  const deps = resolveCreateDependencies(dependencies);
  recordCreateAudit(deps, {
    result: "ERROR",
    recordId: parseFailure.recordId,
    message: parseFailure.auditMessage,
  });
}

export async function createPlanningRun(
  command: CreatePlanningRunCommand,
  context: CreatePlanningRunContext,
  dependencies?: CreatePlanningRunDependencies,
): Promise<CreatePlanningRunResult> {
  const deps = resolveCreateDependencies(dependencies);
  const {
    profileId,
    runRequestId,
    title,
    horizonMonths,
    policyId,
    requestedSnapshotId,
    assumptionsOverride,
    runScenariosEnabled,
    getActionsEnabled,
    analyzeDebtEnabled,
    debtStrategyInput,
    includeProducts,
    monteCarloConfig,
  } = command;
  let scenarioInput = command.scenarioInput;
  const scenarioMeta = command.scenarioMeta;

  const featureFlags = deps.getFeatureFlags();
  if (includeProducts && !featureFlags.includeProductsEnabled) {
    recordCreateAudit(deps, {
      result: "ERROR",
      message: "includeProducts disabled by server feature flag",
    });
    return errorResult({
      code: "INPUT",
      message: "서버 설정으로 includeProducts 기능이 비활성화되어 있습니다.",
      status: 400,
    });
  }
  if (monteCarloConfig && !featureFlags.monteCarloEnabled) {
    recordCreateAudit(deps, {
      result: "ERROR",
      message: "monteCarlo disabled by server feature flag",
    });
    return errorResult({
      code: "INPUT",
      message: "서버 설정으로 Monte Carlo 기능이 비활성화되어 있습니다.",
      status: 400,
    });
  }

  const profileRecord = await deps.getProfile(profileId);
  if (!profileRecord) {
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message: "profile not found",
    });
    return errorResult({
      code: "NO_DATA",
      message: "프로필을 찾을 수 없습니다.",
    });
  }

  const scenarioBaselineRunId = scenarioInput?.baseRunId || scenarioMeta?.baselineRunId;
  if (scenarioBaselineRunId) {
    const baselineRun = await deps.getRun(scenarioBaselineRunId);
    if (!baselineRun) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario baseline run not found",
      });
      return errorResult({
        code: "INPUT",
        message: "scenario baseline runId를 찾을 수 없습니다.",
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
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "profile canonicalization failed",
      });
      return errorResult({
        code: "INPUT",
        message: error.message,
        status: 400,
        issues: validationIssues(error),
      });
    }
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message: "profile canonicalization failed",
    });
    return errorResult({
      code: "INTERNAL",
      message: "실행 저장 검증 중 오류가 발생했습니다.",
    });
  }

  if (scenarioInput) {
    try {
      canonicalProfile = applyProfilePatch(canonicalProfile, scenarioInput.patch);
    } catch (error) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario apply failed",
      });
      if (error instanceof PlanningV2ValidationError) {
        return errorResult({
          code: "INPUT",
          message: "scenario patch 검증에 실패했습니다.",
          status: 400,
          issues: validationIssues(error),
        });
      }
      return errorResult({
        code: "INPUT",
        message: error instanceof Error ? error.message : "scenario 적용에 실패했습니다.",
        status: 400,
      });
    }
  } else if (scenarioMeta) {
    const scenarioIssues = validateScenario(canonicalProfile, scenarioMeta.patches);
    if (scenarioIssues.length > 0) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario validation failed",
      });
      return errorResult({
        code: "INPUT",
        message: "scenario patch 검증에 실패했습니다.",
        status: 400,
        issues: scenarioIssues.map((issue) => `${issue.path}: ${issue.message}`),
      });
    }
    try {
      canonicalProfile = applyScenario(canonicalProfile, scenarioMeta.patches);
    } catch (error) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: "scenario apply failed",
      });
      return errorResult({
        code: "INPUT",
        message: error instanceof Error ? error.message : "scenario 적용에 실패했습니다.",
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
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message: `preflight blocked (${preflightBlockIssues.map((issue) => issue.code).join(", ")})`,
    });
    return errorResult({
      code: "INPUT",
      message: "실행 저장 사전 점검에 실패했습니다.",
      status: 400,
      issues: preflightBlockIssues.map((issue) => formatPreflightIssueLine(issue)),
      meta: {
        preflight: {
          blocks: preflightBlockIssues,
        },
      },
    });
  }

  const riskTolerance = parseRiskTolerance(canonicalProfile as unknown);
  let assumptionsContext: Awaited<ReturnType<typeof resolvePlanningRunAssumptions>>;
  try {
    assumptionsContext = await deps.resolveAssumptions({
      profileId: profileRecord.id,
      requestedSnapshotId,
      assumptionsOverride,
      riskTolerance,
    });
  } catch (error) {
    if (error instanceof PlanningRunAssumptionsResolveError) {
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileId,
        message: error.auditMessage,
      });
      if (error.kind === "SNAPSHOT_NOT_FOUND") {
        return errorResult({
          code: "SNAPSHOT_NOT_FOUND",
          message: error.message,
          status: error.status,
          issues: error.issues,
        });
      }
      if (error.kind === "SNAPSHOT") {
        return errorResult({
          code: "SNAPSHOT",
          message: error.message,
          status: error.status,
        });
      }
      return errorResult({
        code: "INTERNAL",
        message: "저장된 가정 오버라이드 로드에 실패했습니다.",
        status: error.status,
      });
    }

    const message = error instanceof Error ? error.message : "Failed to resolve run assumptions";
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileId,
      message,
    });
    return errorResult({
      code: "INTERNAL",
      message,
      status: 500,
    });
  }

  const {
    snapshot,
    snapshotId,
    snapshotMeta,
    baseAssumptions,
    finalSimulationAssumptions,
    health,
    appliedOverrides,
  } = assumptionsContext;

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
  let stages: CurrentUserRunStageResult[] = [];

  try {
    const pipeline = await deps.runPipeline({
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
            ? await deps.matchCandidatesProvider(actionsBase, {
              includeProducts: true,
              requestBaseUrl: context.requestBaseUrl,
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
      await recordStageMetricsSafely(deps, {
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: pipeline.overallStatus,
        stages,
        totalDurationMs: stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0),
      });
      recordCreateAudit(deps, {
        result: "ERROR",
        recordId: profileRecord.id,
        message: "simulate stage failed",
      });
      return errorResult({
        code: "INTERNAL",
        message: "simulate 단계 실행에 실패했습니다.",
        status: 500,
        meta: {
          overallStatus: pipeline.overallStatus,
          stages,
        },
      });
    }

    const { outputs, resultDto } = buildPlanningRunArtifacts({
      profile: canonicalProfile,
      policyId,
      snapshotMeta,
      healthSummary: health.summary,
      simulatePlan,
      scenariosOutput,
      monteCarloOutput,
      actionsOutput: Array.isArray(actionsOutput) ? actionsOutput : null,
      debtStrategyOutput,
    });
    const reproducibility = buildRunReproducibilityMeta({
      profile: canonicalProfile,
      assumptionsSnapshotId: snapshotId,
      assumptionsSnapshot: snapshot,
      effectiveAssumptions: baseAssumptions,
      appliedOverrides,
      policy: DEFAULT_PLANNING_POLICY,
    });
    const scenarioMetaForRecord = scenarioMeta ?? (scenarioInput ? toLegacyScenarioMetaFromInput(scenarioInput, deps) : undefined);

    const created = await deps.createRunRecord({
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
      } as unknown as CurrentUserRunRecord["outputs"],
    }, {
      storeRawOutputs: asString(process.env.PLANNING_RUN_STORE_RAW_OUTPUTS).toLowerCase() === "true",
    });
    await recordStageMetricsSafely(deps, {
      requestId: runRequestId,
      runId: created.id,
      profileId: profileRecord.id,
      overallStatus: pipeline.overallStatus,
      stages,
      totalDurationMs: stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0),
    });

    recordCreateAudit(deps, {
      result: "SUCCESS",
      recordId: created.id,
      message: "planning run created",
    });

    return {
      ok: true,
      status: 201,
      payload: {
        meta: {
          generatedAt: deps.now().toISOString(),
          snapshot: snapshotMeta,
          normalization: profileNormalization,
          health: health.summary,
          overallStatus: pipeline.overallStatus,
          stages,
        },
        data: created,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 기록 저장에 실패했습니다.";
    if (stages.length > 0) {
      await recordStageMetricsSafely(deps, {
        requestId: runRequestId,
        profileId: profileRecord.id,
        overallStatus: "FAILED",
        stages,
        totalDurationMs: stages.reduce((sum, stage) => sum + (typeof stage.durationMs === "number" ? stage.durationMs : 0), 0),
      });
    }
    recordCreateAudit(deps, {
      result: "ERROR",
      recordId: profileRecord.id,
      message,
    });
    return errorResult({
      code: "INTERNAL",
      message,
      status: 500,
      meta: {
        ...(stages.length > 0 ? { stages } : {}),
      },
    });
  }
}
