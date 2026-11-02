import { isAllocationPolicyId } from "../v2/policy/presets";
import { type AllocationPolicyId } from "../v2/policy/types";
import { type RiskTolerance } from "../v2/scenarios";
import { type RefiOffer } from "../v2/debt/types";
import { PlanningV2ValidationError } from "../v2/types";
import { validateHorizonMonths } from "../v2/validate";
import {
  PLANNING_RUN_INPUT_CONTRACT,
  parsePlanningRunMonteCarloPaths,
  parsePlanningRunMonteCarloSeed,
} from "../../v2/planningRunInputContract";
import { toEngineRateBoundary } from "../../v2/aprBoundary";
import { type ScenarioPatch } from "../../v2/profilePatch";
import { type ScenarioMeta, type ScenarioPatch as LegacyScenarioPatch } from "../../v2/scenario";
import { roundKrw } from "../../calc/roundingPolicy";
import { type CurrentUserRunRecord } from "./routeService";

export type RunsCreateBody = {
  profileId?: unknown;
  rerunOfRunId?: unknown;
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

export type RunInputScenario = NonNullable<CurrentUserRunRecord["input"]["scenario"]>;

export type CreatePlanningRunCommand = {
  profileId: string;
  rerunOfRunId?: string;
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

export type CreatePlanningRunParseDependencies = {
  randomUUID?: () => string;
  now?: () => Date;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseRiskTolerance(rawProfile: unknown): RiskTolerance {
  if (!isRecord(rawProfile)) return "mid";

  const direct = asString(rawProfile.riskTolerance).toLowerCase();
  if (direct === "low" || direct === "mid" || direct === "high") return direct;

  if (isRecord(rawProfile.risk)) {
    const nested = asString(rawProfile.risk.riskTolerance).toLowerCase();
    if (nested === "low" || nested === "mid" || nested === "high") return nested;
  }
  return "mid";
}

export function validationIssues(error: PlanningV2ValidationError): string[] {
  return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
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
  const paths = pathsRaw === undefined
    ? PLANNING_RUN_INPUT_CONTRACT.monteCarloPaths.defaultValue
    : parsePlanningRunMonteCarloPaths(pathsRaw);
  const seed = seedRaw === undefined
    ? PLANNING_RUN_INPUT_CONTRACT.monteCarloSeed.defaultValue
    : parsePlanningRunMonteCarloSeed(seedRaw);

  if (paths === null) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "input.monteCarlo.paths", message: "must be between 1 and 20000" },
    ]);
  }
  if (seed === null) {
    throw new PlanningV2ValidationError("Invalid monteCarlo input", [
      { path: "input.monteCarlo.seed", message: "must be a finite integer" },
    ]);
  }

  return {
    paths,
    seed,
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

export function toLegacyScenarioMetaFromInput(
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

export function legacyScenarioToInputScenario(legacy: ScenarioMeta): RunInputScenario | undefined {
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

function resolveParseDependencies(
  dependencies: CreatePlanningRunParseDependencies = {},
): Required<CreatePlanningRunParseDependencies> {
  return {
    randomUUID: dependencies.randomUUID ?? (() => crypto.randomUUID()),
    now: dependencies.now ?? (() => new Date()),
  };
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
    if (body.rerunOfRunId !== undefined && (typeof body.rerunOfRunId !== "string" || !body.rerunOfRunId.trim())) {
      throw new PlanningV2ValidationError("Invalid rerun source", [{ path: "rerunOfRunId", message: "must be a non-empty string" }]);
    }
    return {
      ok: true,
      command: {
        profileId,
        ...(body.rerunOfRunId ? { rerunOfRunId: asString(body.rerunOfRunId) } : {}),
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
