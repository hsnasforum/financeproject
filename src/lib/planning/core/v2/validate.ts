import {
  type CashflowPhaseV2,
  type ContributionFlowV2,
  type MonthRange,
  type PensionProfileV1,
  type PensionFlowV2,
  type ProfileCashflowV2,
  type TaxProfileV1,
  PlanningV2ValidationError,
  type ProfileV2,
  type ProfileV2Debt,
  type ProfileV2Goal,
  type SimulationAssumptionsResolvedV2,
  type SimulationAssumptionsV2,
  type ValidationIssueV2,
  type ValidatedSimulationInputV2,
} from "./types";
import { resolveAllocationPolicyId } from "./policy/presets";
import { toEngineRateBoundary } from "../../v2/aprBoundary";

const MIN_ANNUAL_RATE = -0.99;
const MAX_ANNUAL_RATE = 2;
const MIN_GROWTH_RATE = -0.05;
const MAX_GROWTH_RATE = 0.2;
const MAX_DEPENDENTS = 20;
const MIN_START_AGE = 0;
const MAX_START_AGE = 120;
const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function normalizeAnnualRate(raw: number, path: string, issues: ValidationIssueV2[]): number {
  let normalized = raw;

  if (Math.abs(normalized) > 1) {
    normalized = normalized / 100;
  }

  if (normalized < MIN_ANNUAL_RATE || normalized > MAX_ANNUAL_RATE) {
    issues.push({ path, message: `rate must be between ${MIN_ANNUAL_RATE} and ${MAX_ANNUAL_RATE} after normalization` });
  }

  return normalized;
}

function assertNonNegativeNumber(value: unknown, path: string, issues: ValidationIssueV2[]): number {
  if (!isFiniteNumber(value)) {
    issues.push({ path, message: "must be a finite number" });
    return 0;
  }
  if (value < 0) {
    issues.push({ path, message: "must be >= 0" });
    return 0;
  }
  return value;
}

function normalizeMonthRange(input: unknown, path: string, issues: ValidationIssueV2[]): MonthRange {
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return { startMonth: 0, endMonth: 0 };
  }

  const startRaw = assertNonNegativeNumber(input.startMonth, `${path}.startMonth`, issues);
  const endRaw = assertNonNegativeNumber(input.endMonth, `${path}.endMonth`, issues);
  const startMonth = Math.trunc(startRaw);
  const endMonth = Math.trunc(endRaw);
  if (endMonth < startMonth) {
    issues.push({ path, message: "range must satisfy startMonth <= endMonth" });
  }
  return {
    startMonth,
    endMonth: Math.max(startMonth, endMonth),
  };
}

function normalizeGrowthRate(raw: unknown, path: string, issues: ValidationIssueV2[]): number | undefined {
  if (raw === undefined) return undefined;
  if (!isFiniteNumber(raw)) {
    issues.push({ path, message: "must be a finite number" });
    return undefined;
  }
  const normalized = Math.abs(raw) <= 1 ? raw : raw / 100;
  if (normalized < MIN_GROWTH_RATE || normalized > MAX_GROWTH_RATE) {
    issues.push({
      path,
      message: `must be between ${MIN_GROWTH_RATE} and ${MAX_GROWTH_RATE} after normalization`,
    });
  }
  return normalized;
}

function normalizeCashflowPhase(input: unknown, index: number, issues: ValidationIssueV2[]): CashflowPhaseV2 {
  const path = `profile.cashflow.phases[${index}]`;
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return {
      id: `phase-${index + 1}`,
      title: `Phase ${index + 1}`,
      range: { startMonth: 0, endMonth: 0 },
    };
  }

  const id = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `phase-${index + 1}`;
  const title = typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim() : `Phase ${index + 1}`;
  const range = normalizeMonthRange(input.range, `${path}.range`, issues);
  const monthlyIncomeKrw = input.monthlyIncomeKrw === undefined
    ? undefined
    : assertNonNegativeNumber(input.monthlyIncomeKrw, `${path}.monthlyIncomeKrw`, issues);
  const monthlyFixedExpensesKrw = input.monthlyFixedExpensesKrw === undefined
    ? undefined
    : assertNonNegativeNumber(input.monthlyFixedExpensesKrw, `${path}.monthlyFixedExpensesKrw`, issues);
  const monthlyVariableExpensesKrw = input.monthlyVariableExpensesKrw === undefined
    ? undefined
    : assertNonNegativeNumber(input.monthlyVariableExpensesKrw, `${path}.monthlyVariableExpensesKrw`, issues);
  const incomeGrowthPctYoY = normalizeGrowthRate(input.incomeGrowthPctYoY, `${path}.incomeGrowthPctYoY`, issues);
  const expenseGrowthExtraPctYoY = normalizeGrowthRate(input.expenseGrowthExtraPctYoY, `${path}.expenseGrowthExtraPctYoY`, issues);

  return {
    id,
    title,
    range,
    ...(monthlyIncomeKrw !== undefined ? { monthlyIncomeKrw } : {}),
    ...(monthlyFixedExpensesKrw !== undefined ? { monthlyFixedExpensesKrw } : {}),
    ...(monthlyVariableExpensesKrw !== undefined ? { monthlyVariableExpensesKrw } : {}),
    ...(incomeGrowthPctYoY !== undefined ? { incomeGrowthPctYoY } : {}),
    ...(expenseGrowthExtraPctYoY !== undefined ? { expenseGrowthExtraPctYoY } : {}),
  };
}

function normalizePensionFlow(input: unknown, index: number, issues: ValidationIssueV2[]): PensionFlowV2 {
  const path = `profile.cashflow.pensions[${index}]`;
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return {
      id: `pension-${index + 1}`,
      title: `Pension ${index + 1}`,
      range: { startMonth: 0, endMonth: 0 },
      monthlyPayoutKrw: 0,
    };
  }

  const id = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `pension-${index + 1}`;
  const title = typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim() : `Pension ${index + 1}`;
  const range = normalizeMonthRange(input.range, `${path}.range`, issues);
  const monthlyPayoutKrw = assertNonNegativeNumber(input.monthlyPayoutKrw, `${path}.monthlyPayoutKrw`, issues);

  return {
    id,
    title,
    range,
    monthlyPayoutKrw,
  };
}

function normalizeContributionFlow(input: unknown, index: number, issues: ValidationIssueV2[]): ContributionFlowV2 {
  const path = `profile.cashflow.contributions[${index}]`;
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return {
      id: `contrib-${index + 1}`,
      title: `Contribution ${index + 1}`,
      range: { startMonth: 0, endMonth: 0 },
      from: "cash",
      to: "investments",
      monthlyAmountKrw: 0,
    };
  }

  const id = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `contrib-${index + 1}`;
  const title = typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim() : `Contribution ${index + 1}`;
  const range = normalizeMonthRange(input.range, `${path}.range`, issues);
  const monthlyAmountKrw = assertNonNegativeNumber(input.monthlyAmountKrw, `${path}.monthlyAmountKrw`, issues);

  const from = typeof input.from === "string" ? input.from.trim() : "";
  if (from !== "cash") {
    issues.push({ path: `${path}.from`, message: "must be 'cash'" });
  }

  const to = typeof input.to === "string" ? input.to.trim() : "";
  if (to !== "investments" && to !== "pension") {
    issues.push({ path: `${path}.to`, message: "must be 'investments' or 'pension'" });
  }

  return {
    id,
    title,
    range,
    from: "cash",
    to: to === "pension" ? "pension" : "investments",
    monthlyAmountKrw,
  };
}

function normalizeCashflow(input: unknown, issues: ValidationIssueV2[]): ProfileCashflowV2 | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    issues.push({ path: "profile.cashflow", message: "must be an object" });
    return undefined;
  }

  const monthlyIncomeKrw = input.monthlyIncomeKrw === undefined
    ? undefined
    : assertNonNegativeNumber(input.monthlyIncomeKrw, "profile.cashflow.monthlyIncomeKrw", issues);
  const monthlyFixedExpensesKrw = input.monthlyFixedExpensesKrw === undefined
    ? undefined
    : assertNonNegativeNumber(input.monthlyFixedExpensesKrw, "profile.cashflow.monthlyFixedExpensesKrw", issues);
  const monthlyVariableExpensesKrw = input.monthlyVariableExpensesKrw === undefined
    ? undefined
    : assertNonNegativeNumber(input.monthlyVariableExpensesKrw, "profile.cashflow.monthlyVariableExpensesKrw", issues);

  const phases = Array.isArray(input.phases)
    ? input.phases.map((phase, index) => normalizeCashflowPhase(phase, index, issues))
    : [];
  const pensions = Array.isArray(input.pensions)
    ? input.pensions.map((flow, index) => normalizePensionFlow(flow, index, issues))
    : [];
  const contributions = Array.isArray(input.contributions)
    ? input.contributions.map((flow, index) => normalizeContributionFlow(flow, index, issues))
    : [];

  if (input.phases !== undefined && !Array.isArray(input.phases)) {
    issues.push({ path: "profile.cashflow.phases", message: "must be an array" });
  }
  if (input.pensions !== undefined && !Array.isArray(input.pensions)) {
    issues.push({ path: "profile.cashflow.pensions", message: "must be an array" });
  }
  if (input.contributions !== undefined && !Array.isArray(input.contributions)) {
    issues.push({ path: "profile.cashflow.contributions", message: "must be an array" });
  }

  let phaseOverlapPolicy: "sum" | "override" | undefined;
  if (input.rules !== undefined) {
    if (!isRecord(input.rules)) {
      issues.push({ path: "profile.cashflow.rules", message: "must be an object" });
    } else if (input.rules.phaseOverlapPolicy !== undefined) {
      const raw = typeof input.rules.phaseOverlapPolicy === "string" ? input.rules.phaseOverlapPolicy.trim() : "";
      if (raw !== "sum" && raw !== "override") {
        issues.push({ path: "profile.cashflow.rules.phaseOverlapPolicy", message: "must be 'sum' or 'override'" });
      } else {
        phaseOverlapPolicy = raw;
      }
    }
  }

  return {
    ...(monthlyIncomeKrw !== undefined ? { monthlyIncomeKrw } : {}),
    ...(monthlyFixedExpensesKrw !== undefined ? { monthlyFixedExpensesKrw } : {}),
    ...(monthlyVariableExpensesKrw !== undefined ? { monthlyVariableExpensesKrw } : {}),
    ...(phases.length > 0 ? { phases } : {}),
    ...(pensions.length > 0 ? { pensions } : {}),
    ...(contributions.length > 0 ? { contributions } : {}),
    ...(phaseOverlapPolicy ? { rules: { phaseOverlapPolicy } } : {}),
  };
}

function normalizeOptionalNotes(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalStartAge(value: unknown, path: string, issues: ValidationIssueV2[]): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value)) {
    issues.push({ path, message: "must be a finite number" });
    return undefined;
  }
  const normalized = Math.trunc(value);
  if (normalized < MIN_START_AGE || normalized > MAX_START_AGE) {
    issues.push({ path, message: `must be between ${MIN_START_AGE} and ${MAX_START_AGE}` });
    return undefined;
  }
  return normalized;
}

function normalizeOptionalAge(value: unknown, path: string, issues: ValidationIssueV2[]): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value)) {
    issues.push({ path, message: "must be a finite number" });
    return undefined;
  }
  const normalized = Math.trunc(value);
  if (normalized < MIN_START_AGE || normalized > MAX_START_AGE) {
    issues.push({ path, message: `must be between ${MIN_START_AGE} and ${MAX_START_AGE}` });
    return undefined;
  }
  return normalized;
}

function normalizeOptionalBirthYear(value: unknown, path: string, issues: ValidationIssueV2[]): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value)) {
    issues.push({ path, message: "must be a finite number" });
    return undefined;
  }
  const normalized = Math.trunc(value);
  if (normalized < MIN_BIRTH_YEAR || normalized > MAX_BIRTH_YEAR) {
    issues.push({ path, message: `must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR}` });
    return undefined;
  }
  return normalized;
}

function normalizeOptionalGender(value: unknown, path: string, issues: ValidationIssueV2[]): "M" | "F" | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    issues.push({ path, message: "must be 'M' or 'F'" });
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized !== "M" && normalized !== "F") {
    issues.push({ path, message: "must be 'M' or 'F'" });
    return undefined;
  }
  return normalized;
}

function normalizeOptionalRegionText(value: unknown, path: string, issues: ValidationIssueV2[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    issues.push({ path, message: "must be a string" });
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > 60) {
    issues.push({ path, message: "must be 60 chars or fewer" });
    return undefined;
  }
  return normalized;
}

function normalizeOptionalPayout(value: unknown, path: string, issues: ValidationIssueV2[]): number | undefined {
  if (value === undefined) return undefined;
  return assertNonNegativeNumber(value, path, issues);
}

function normalizeTaxProfile(input: unknown, issues: ValidationIssueV2[]): TaxProfileV1 | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    issues.push({ path: "profile.tax", message: "must be an object" });
    return undefined;
  }

  const regime = typeof input.regime === "string" ? input.regime.trim().toUpperCase() : "";
  if (regime !== "KR") {
    issues.push({ path: "profile.tax.regime", message: "must be 'KR'" });
  }

  let filingStatus: TaxProfileV1["filingStatus"] | undefined;
  if (input.filingStatus !== undefined) {
    const raw = typeof input.filingStatus === "string" ? input.filingStatus.trim() : "";
    if (raw !== "single" && raw !== "married") {
      issues.push({ path: "profile.tax.filingStatus", message: "must be 'single' or 'married'" });
    } else {
      filingStatus = raw;
    }
  }

  let dependents: number | undefined;
  if (input.dependents !== undefined) {
    if (!isFiniteNumber(input.dependents)) {
      issues.push({ path: "profile.tax.dependents", message: "must be a finite number" });
    } else {
      const normalized = Math.trunc(input.dependents);
      if (normalized < 0 || normalized > MAX_DEPENDENTS) {
        issues.push({ path: "profile.tax.dependents", message: `must be between 0 and ${MAX_DEPENDENTS}` });
      } else {
        dependents = normalized;
      }
    }
  }

  const notes = normalizeOptionalNotes(input.notes);
  return {
    regime: "KR",
    ...(filingStatus ? { filingStatus } : {}),
    ...(dependents !== undefined ? { dependents } : {}),
    ...(notes ? { notes } : {}),
  };
}

function normalizePensionDetailFlow(
  input: unknown,
  path: string,
  issues: ValidationIssueV2[],
): { expectedMonthlyPayoutKrw?: number; startAge?: number } | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return undefined;
  }
  const expectedMonthlyPayoutKrw = normalizeOptionalPayout(
    input.expectedMonthlyPayoutKrw,
    `${path}.expectedMonthlyPayoutKrw`,
    issues,
  );
  const startAge = normalizeOptionalStartAge(input.startAge, `${path}.startAge`, issues);
  return {
    ...(expectedMonthlyPayoutKrw !== undefined ? { expectedMonthlyPayoutKrw } : {}),
    ...(startAge !== undefined ? { startAge } : {}),
  };
}

function normalizePensionProfile(input: unknown, issues: ValidationIssueV2[]): PensionProfileV1 | undefined {
  if (input === undefined || input === null) return undefined;
  if (!isRecord(input)) {
    issues.push({ path: "profile.pensionsDetailed", message: "must be an object" });
    return undefined;
  }

  const regime = typeof input.regime === "string" ? input.regime.trim().toUpperCase() : "";
  if (regime !== "KR") {
    issues.push({ path: "profile.pensionsDetailed.regime", message: "must be 'KR'" });
  }

  const nationalPension = normalizePensionDetailFlow(
    input.nationalPension,
    "profile.pensionsDetailed.nationalPension",
    issues,
  );
  const personalPension = normalizePensionDetailFlow(
    input.personalPension,
    "profile.pensionsDetailed.personalPension",
    issues,
  );

  let retirementPension:
    | { type?: "DC" | "DB" | "IRP"; expectedMonthlyPayoutKrw?: number; startAge?: number }
    | undefined;
  if (input.retirementPension !== undefined && input.retirementPension !== null) {
    if (!isRecord(input.retirementPension)) {
      issues.push({ path: "profile.pensionsDetailed.retirementPension", message: "must be an object" });
    } else {
      const detail = normalizePensionDetailFlow(
        input.retirementPension,
        "profile.pensionsDetailed.retirementPension",
        issues,
      ) ?? {};
      let type: "DC" | "DB" | "IRP" | undefined;
      if (input.retirementPension.type !== undefined) {
        const rawType = typeof input.retirementPension.type === "string"
          ? input.retirementPension.type.trim().toUpperCase()
          : "";
        if (rawType !== "DC" && rawType !== "DB" && rawType !== "IRP") {
          issues.push({ path: "profile.pensionsDetailed.retirementPension.type", message: "must be 'DC', 'DB', or 'IRP'" });
        } else {
          type = rawType;
        }
      }
      retirementPension = {
        ...(type ? { type } : {}),
        ...detail,
      };
    }
  }

  const notes = normalizeOptionalNotes(input.notes);
  return {
    regime: "KR",
    ...(nationalPension && Object.keys(nationalPension).length > 0 ? { nationalPension } : {}),
    ...(retirementPension && Object.keys(retirementPension).length > 0 ? { retirementPension } : {}),
    ...(personalPension && Object.keys(personalPension).length > 0 ? { personalPension } : {}),
    ...(notes ? { notes } : {}),
  };
}

function normalizeGoal(input: unknown, index: number, issues: ValidationIssueV2[]): ProfileV2Goal {
  const path = `profile.goals[${index}]`;
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return {
      id: `goal-${index + 1}`,
      name: `Goal ${index + 1}`,
      targetAmount: 0,
      currentAmount: 0,
      targetMonth: 12,
      priority: 3,
      minimumMonthlyContribution: 0,
    };
  }

  const id = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `goal-${index + 1}`;
  const name = typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : `Goal ${index + 1}`;
  const targetAmount = assertNonNegativeNumber(input.targetAmount, `${path}.targetAmount`, issues);
  const currentAmount = input.currentAmount === undefined
    ? 0
    : assertNonNegativeNumber(input.currentAmount, `${path}.currentAmount`, issues);

  let targetMonth: number | undefined;
  if (input.targetMonth !== undefined) {
    const rawTargetMonth = assertNonNegativeNumber(input.targetMonth, `${path}.targetMonth`, issues);
    if (rawTargetMonth > 0) targetMonth = Math.trunc(rawTargetMonth);
    if (rawTargetMonth === 0) issues.push({ path: `${path}.targetMonth`, message: "must be >= 1 when provided" });
  }

  let priority = 3;
  if (input.priority !== undefined) {
    const rawPriority = assertNonNegativeNumber(input.priority, `${path}.priority`, issues);
    priority = Math.min(5, Math.max(1, Math.trunc(rawPriority)));
  }

  const minimumMonthlyContribution = input.minimumMonthlyContribution === undefined
    ? 0
    : assertNonNegativeNumber(input.minimumMonthlyContribution, `${path}.minimumMonthlyContribution`, issues);

  return {
    id,
    name,
    targetAmount,
    currentAmount,
    targetMonth,
    priority,
    minimumMonthlyContribution,
  };
}

function normalizeDebt(input: unknown, index: number, issues: ValidationIssueV2[]): ProfileV2Debt {
  const path = `profile.debts[${index}]`;
  if (!isRecord(input)) {
    issues.push({ path, message: "must be an object" });
    return {
      id: `debt-${index + 1}`,
      name: `Debt ${index + 1}`,
      balance: 0,
      minimumPayment: 0,
      apr: 0,
    };
  }

  const id = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `debt-${index + 1}`;
  const name = typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : `Debt ${index + 1}`;
  const balance = assertNonNegativeNumber(input.balance, `${path}.balance`, issues);
  const minimumPayment = assertNonNegativeNumber(input.minimumPayment, `${path}.minimumPayment`, issues);

  let apr: number | undefined;
  let aprPct: number | undefined;
  const rawAprPct = input.aprPct ?? input.apr;
  if (rawAprPct !== undefined) {
    if (!isFiniteNumber(rawAprPct)) {
      issues.push({ path: `${path}.aprPct`, message: "must be a finite number" });
    } else {
      try {
        const normalized = toEngineRateBoundary(rawAprPct);
        aprPct = normalized.pct;
        apr = normalized.decimal;
      } catch {
        issues.push({
          path: `${path}.aprPct`,
          message: "must be 0, legacy decimal(0<x<=1), or percent(1<x<=100)",
        });
      }
      if (typeof apr === "number" && (apr < MIN_ANNUAL_RATE || apr > MAX_ANNUAL_RATE)) {
        issues.push({
          path: `${path}.aprPct`,
          message: `rate must be between ${MIN_ANNUAL_RATE * 100} and ${MAX_ANNUAL_RATE * 100}% after normalization`,
        });
      }
    }
  }

  let remainingMonths: number | undefined;
  if (input.remainingMonths !== undefined) {
    const rawRemainingMonths = assertNonNegativeNumber(input.remainingMonths, `${path}.remainingMonths`, issues);
    if (rawRemainingMonths === 0) {
      issues.push({ path: `${path}.remainingMonths`, message: "must be >= 1 when provided" });
    } else {
      remainingMonths = Math.trunc(rawRemainingMonths);
    }
  }

  let repaymentType: "amortizing" | "interestOnly" | undefined;
  if (input.repaymentType !== undefined) {
    const rawRepaymentType = typeof input.repaymentType === "string" ? input.repaymentType.trim() : "";
    if (rawRepaymentType !== "amortizing" && rawRepaymentType !== "interestOnly") {
      issues.push({ path: `${path}.repaymentType`, message: "must be 'amortizing' or 'interestOnly'" });
    } else {
      repaymentType = rawRepaymentType;
    }
  }

  return {
    id,
    name,
    balance,
    minimumPayment,
    aprPct,
    apr,
    remainingMonths,
    repaymentType,
  };
}

function normalizeDefaultsApplied(
  input: unknown,
  issues: ValidationIssueV2[],
): ProfileV2["defaultsApplied"] | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) {
    issues.push({ path: "profile.defaultsApplied", message: "must be an object" });
    return undefined;
  }

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = Array.from(new Set(
    rawItems
      .map((item, index) => {
        if (typeof item !== "string") {
          issues.push({ path: `profile.defaultsApplied.items[${index}]`, message: "must be a string" });
          return "";
        }
        return item.trim();
      })
      .filter((item) => item.length > 0),
  ));

  const assumptionsInput = isRecord(input.assumptions) ? input.assumptions : {};
  const emergencyMonthsRaw = Number(assumptionsInput.emergencyMonths);
  const goalPriorityRaw = Number(assumptionsInput.goalPriority);
  const missingFieldsPolicyRaw = typeof assumptionsInput.missingFieldsPolicy === "string"
    ? assumptionsInput.missingFieldsPolicy.trim()
    : "";

  const emergencyMonths = Number.isFinite(emergencyMonthsRaw) && emergencyMonthsRaw >= 1
    ? Math.trunc(emergencyMonthsRaw)
    : 6;
  const goalPriority = Number.isFinite(goalPriorityRaw) && goalPriorityRaw >= 1
    ? Math.trunc(goalPriorityRaw)
    : 3;
  const missingFieldsPolicy = missingFieldsPolicyRaw || "fill-with-defaults";

  const appliedAt = normalizeOptionalNotes(input.appliedAt);
  return {
    version: 1,
    items,
    assumptions: {
      emergencyMonths,
      goalPriority,
      missingFieldsPolicy,
    },
    ...(appliedAt ? { appliedAt } : {}),
  };
}

export function validateProfileV2(input: unknown): ProfileV2 {
  const issues: ValidationIssueV2[] = [];

  if (!isRecord(input)) {
    throw new PlanningV2ValidationError("Invalid profile v2", [{ path: "profile", message: "must be an object" }]);
  }

  const normalizedCashflow = normalizeCashflow(input.cashflow, issues);
  const normalizedTaxProfile = normalizeTaxProfile(input.tax, issues);
  const normalizedPensionsDetailed = normalizePensionProfile(input.pensionsDetailed, issues);
  const normalizedDefaultsApplied = normalizeDefaultsApplied(input.defaultsApplied, issues);
  const currentAge = normalizeOptionalAge(input.currentAge, "profile.currentAge", issues);
  const birthYear = normalizeOptionalBirthYear(input.birthYear, "profile.birthYear", issues);
  const gender = normalizeOptionalGender(input.gender, "profile.gender", issues);
  const sido = normalizeOptionalRegionText(input.sido, "profile.sido", issues);
  const sigungu = normalizeOptionalRegionText(input.sigungu, "profile.sigungu", issues);

  const profile: ProfileV2 = {
    ...(currentAge !== undefined ? { currentAge } : {}),
    ...(birthYear !== undefined ? { birthYear } : {}),
    ...(gender !== undefined ? { gender } : {}),
    ...(sido !== undefined ? { sido } : {}),
    ...(sigungu !== undefined ? { sigungu } : {}),
    monthlyIncomeNet: assertNonNegativeNumber(input.monthlyIncomeNet, "profile.monthlyIncomeNet", issues),
    monthlyEssentialExpenses: assertNonNegativeNumber(input.monthlyEssentialExpenses, "profile.monthlyEssentialExpenses", issues),
    monthlyDiscretionaryExpenses: assertNonNegativeNumber(input.monthlyDiscretionaryExpenses, "profile.monthlyDiscretionaryExpenses", issues),
    liquidAssets: assertNonNegativeNumber(input.liquidAssets, "profile.liquidAssets", issues),
    investmentAssets: assertNonNegativeNumber(input.investmentAssets, "profile.investmentAssets", issues),
    debts: Array.isArray(input.debts) ? input.debts.map((debt, index) => normalizeDebt(debt, index, issues)) : [],
    goals: Array.isArray(input.goals) ? input.goals.map((goal, index) => normalizeGoal(goal, index, issues)) : [],
    ...(normalizedCashflow ? { cashflow: normalizedCashflow } : {}),
    ...(normalizedTaxProfile ? { tax: normalizedTaxProfile } : {}),
    ...(normalizedPensionsDetailed ? { pensionsDetailed: normalizedPensionsDetailed } : {}),
    ...(normalizedDefaultsApplied ? { defaultsApplied: normalizedDefaultsApplied } : {}),
  };

  if (!Array.isArray(input.debts)) {
    issues.push({ path: "profile.debts", message: "must be an array" });
  }
  if (!Array.isArray(input.goals)) {
    issues.push({ path: "profile.goals", message: "must be an array" });
  }

  const seenDebtIds = new Set<string>();
  profile.debts.forEach((debt, index) => {
    if (seenDebtIds.has(debt.id)) {
      issues.push({ path: `profile.debts[${index}].id`, message: "must be unique" });
    }
    seenDebtIds.add(debt.id);
  });

  const seenGoalIds = new Set<string>();
  profile.goals.forEach((goal, index) => {
    if (seenGoalIds.has(goal.id)) {
      issues.push({ path: `profile.goals[${index}].id`, message: "must be unique" });
    }
    seenGoalIds.add(goal.id);
  });

  const cashflow = profile.cashflow;
  if (cashflow?.phases) {
    const seenPhaseIds = new Set<string>();
    cashflow.phases.forEach((phase, index) => {
      if (seenPhaseIds.has(phase.id)) {
        issues.push({ path: `profile.cashflow.phases[${index}].id`, message: "must be unique" });
      }
      seenPhaseIds.add(phase.id);
    });
  }
  if (cashflow?.pensions) {
    const seenPensionIds = new Set<string>();
    cashflow.pensions.forEach((flow, index) => {
      if (seenPensionIds.has(flow.id)) {
        issues.push({ path: `profile.cashflow.pensions[${index}].id`, message: "must be unique" });
      }
      seenPensionIds.add(flow.id);
    });
  }
  if (cashflow?.contributions) {
    const seenContributionIds = new Set<string>();
    cashflow.contributions.forEach((flow, index) => {
      if (seenContributionIds.has(flow.id)) {
        issues.push({ path: `profile.cashflow.contributions[${index}].id`, message: "must be unique" });
      }
      seenContributionIds.add(flow.id);
    });
  }

  if (issues.length > 0) {
    throw new PlanningV2ValidationError("Invalid profile v2", issues);
  }

  return profile;
}

export function validateAssumptionsV2(input: unknown): SimulationAssumptionsResolvedV2 {
  const issues: ValidationIssueV2[] = [];
  if (!isRecord(input)) {
    throw new PlanningV2ValidationError("Invalid assumptions", [{ path: "assumptions", message: "must be an object" }]);
  }

  if (!isFiniteNumber(input.inflation)) {
    issues.push({ path: "assumptions.inflation", message: "must be a finite number" });
  }
  if (!isFiniteNumber(input.expectedReturn)) {
    issues.push({ path: "assumptions.expectedReturn", message: "must be a finite number" });
  }

  const annualInflationRate = isFiniteNumber(input.inflation)
    ? normalizeAnnualRate(input.inflation, "assumptions.inflation", issues)
    : 0;
  const annualExpectedReturnRate = isFiniteNumber(input.expectedReturn)
    ? normalizeAnnualRate(input.expectedReturn, "assumptions.expectedReturn", issues)
    : 0;

  const annualDebtRates: Record<string, number> = {};
  if (input.debtRates !== undefined) {
    if (!isRecord(input.debtRates)) {
      issues.push({ path: "assumptions.debtRates", message: "must be a key-value object" });
    } else {
      Object.entries(input.debtRates).forEach(([debtId, debtRate]) => {
        if (!isFiniteNumber(debtRate)) {
          issues.push({ path: `assumptions.debtRates.${debtId}`, message: "must be a finite number" });
          return;
        }
        annualDebtRates[debtId] = normalizeAnnualRate(debtRate, `assumptions.debtRates.${debtId}`, issues);
      });
    }
  }

  if (issues.length > 0) {
    throw new PlanningV2ValidationError("Invalid assumptions", issues);
  }

  const monthlyDebtRates: Record<string, number> = {};
  Object.entries(annualDebtRates).forEach(([debtId, annualRate]) => {
    monthlyDebtRates[debtId] = toMonthlyRate(annualRate);
  });

  return {
    annualInflationRate,
    annualExpectedReturnRate,
    monthlyInflationRate: toMonthlyRate(annualInflationRate),
    monthlyExpectedReturnRate: toMonthlyRate(annualExpectedReturnRate),
    annualDebtRates,
    monthlyDebtRates,
  };
}

export function validateHorizonMonths(input: unknown): number {
  if (!isFiniteNumber(input)) {
    throw new PlanningV2ValidationError("Invalid horizonMonths", [{ path: "horizonMonths", message: "must be a finite number" }]);
  }

  const value = Math.trunc(input);
  if (value < 1 || value > 1200) {
    throw new PlanningV2ValidationError("Invalid horizonMonths", [
      { path: "horizonMonths", message: "must be between 1 and 1200" },
    ]);
  }

  return value;
}

export function validateSimulationInputV2(
  profile: unknown,
  assumptions: unknown,
  horizonMonths: unknown,
  policyId?: unknown,
): ValidatedSimulationInputV2 {
  return {
    profile: validateProfileV2(profile),
    assumptions: validateAssumptionsV2(assumptions as SimulationAssumptionsV2),
    horizonMonths: validateHorizonMonths(horizonMonths),
    policyId: resolveAllocationPolicyId(policyId),
  };
}
