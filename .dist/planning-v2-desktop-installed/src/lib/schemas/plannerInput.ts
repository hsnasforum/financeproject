import { addIssue, createValidationBag } from "../http/validate";
import { type PlannerInput } from "../planner/types";
import {
  buildParseResult,
  parseStringIssues,
  type Issue,
  type ParseResult,
} from "./issueTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDebts(value: unknown, bag: ReturnType<typeof createValidationBag>): PlannerInput["debts"] {
  if (!Array.isArray(value)) {
    addIssue(bag, "input.debts", "must be an array");
    return [];
  }

  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      addIssue(bag, `input.debts[${index}]`, "must be an object");
      return { name: "", balance: 0, aprPct: 0, monthlyPayment: 0 };
    }

    const balance = asNumber(raw.balance);
    const aprPct = asNumber(raw.aprPct);
    const monthlyPayment = asNumber(raw.monthlyPayment);

    if (typeof raw.name !== "string") addIssue(bag, `input.debts[${index}].name`, "must be a string");
    if (balance === null) addIssue(bag, `input.debts[${index}].balance`, "must be numeric");
    if (aprPct === null) addIssue(bag, `input.debts[${index}].aprPct`, "must be numeric");
    if (monthlyPayment === null) addIssue(bag, `input.debts[${index}].monthlyPayment`, "must be numeric");

    return {
      name: typeof raw.name === "string" ? raw.name : "",
      balance: balance ?? 0,
      aprPct: aprPct ?? 0,
      monthlyPayment: monthlyPayment ?? 0,
    };
  });
}

function parseGoals(value: unknown, bag: ReturnType<typeof createValidationBag>): PlannerInput["goals"] {
  if (!Array.isArray(value)) {
    addIssue(bag, "input.goals", "must be an array");
    return [];
  }

  return value.map((raw, index) => {
    if (!isRecord(raw)) {
      addIssue(bag, `input.goals[${index}]`, "must be an object");
      return { name: "", targetAmount: 0 };
    }

    const targetAmount = asNumber(raw.targetAmount);
    const horizonMonths = raw.horizonMonths === undefined ? undefined : asNumber(raw.horizonMonths);

    if (typeof raw.name !== "string") addIssue(bag, `input.goals[${index}].name`, "must be a string");
    if (targetAmount === null) addIssue(bag, `input.goals[${index}].targetAmount`, "must be numeric");
    if (raw.horizonMonths !== undefined && horizonMonths === null) {
      addIssue(bag, `input.goals[${index}].horizonMonths`, "must be numeric");
    }

    return {
      name: typeof raw.name === "string" ? raw.name : "",
      targetAmount: targetAmount ?? 0,
      horizonMonths: horizonMonths === null ? undefined : horizonMonths,
    };
  });
}

export function parsePlannerInput(value: unknown): ParseResult<PlannerInput> {
  const bag = createValidationBag();

  if (!isRecord(value)) {
    return buildParseResult(
      {
        monthlyIncomeNet: 0,
        monthlyFixedExpenses: 0,
        monthlyVariableExpenses: 0,
        liquidAssets: 0,
        otherAssets: undefined,
        debts: [],
        goals: [],
      },
      [{ path: "input", message: "must be an object" }],
    );
  }

  const monthlyIncomeNet = asNumber(value.monthlyIncomeNet);
  const monthlyFixedExpenses = asNumber(value.monthlyFixedExpenses);
  const monthlyVariableExpenses = asNumber(value.monthlyVariableExpenses);
  const liquidAssets = asNumber(value.liquidAssets);
  const otherAssets = value.otherAssets === undefined ? undefined : asNumber(value.otherAssets);

  if (monthlyIncomeNet === null) addIssue(bag, "input.monthlyIncomeNet", "must be numeric");
  if (monthlyFixedExpenses === null) addIssue(bag, "input.monthlyFixedExpenses", "must be numeric");
  if (monthlyVariableExpenses === null) addIssue(bag, "input.monthlyVariableExpenses", "must be numeric");
  if (liquidAssets === null) addIssue(bag, "input.liquidAssets", "must be numeric");
  if (value.otherAssets !== undefined && otherAssets === null) addIssue(bag, "input.otherAssets", "must be numeric");

  const debts = parseDebts(value.debts, bag);
  const goals = parseGoals(value.goals, bag);

  return buildParseResult(
    {
      monthlyIncomeNet: monthlyIncomeNet ?? 0,
      monthlyFixedExpenses: monthlyFixedExpenses ?? 0,
      monthlyVariableExpenses: monthlyVariableExpenses ?? 0,
      liquidAssets: liquidAssets ?? 0,
      otherAssets: otherAssets ?? undefined,
      debts,
      goals,
    },
    parseStringIssues(bag.issues),
  );
}

export function issuesToApi(issues: Issue[]): string[] {
  return issues.map((entry) => `${entry.path} ${entry.message}`);
}
