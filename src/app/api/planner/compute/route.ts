import { NextResponse } from "next/server";
import { clampPlannerAssumptions, computePlanner } from "@/lib/planner/compute";
import { PlannerInputError, type PlannerInput, type PlannerAssumptions } from "@/lib/planner/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDebts(value: unknown, issues: string[]) {
  if (!Array.isArray(value)) {
    issues.push("input.debts must be an array");
    return [];
  }

  return value.map((raw, index) => {
    if (!isObject(raw)) {
      issues.push(`input.debts[${index}] must be an object`);
      return { name: "", balance: 0, aprPct: 0, monthlyPayment: 0 };
    }

    const balance = asNumber(raw.balance);
    const aprPct = asNumber(raw.aprPct);
    const monthlyPayment = asNumber(raw.monthlyPayment);

    if (typeof raw.name !== "string") issues.push(`input.debts[${index}].name must be a string`);
    if (balance === null) issues.push(`input.debts[${index}].balance must be numeric`);
    if (aprPct === null) issues.push(`input.debts[${index}].aprPct must be numeric`);
    if (monthlyPayment === null) issues.push(`input.debts[${index}].monthlyPayment must be numeric`);

    return {
      name: typeof raw.name === "string" ? raw.name : "",
      balance: balance ?? 0,
      aprPct: aprPct ?? 0,
      monthlyPayment: monthlyPayment ?? 0,
    };
  });
}

function parseGoals(value: unknown, issues: string[]) {
  if (!Array.isArray(value)) {
    issues.push("input.goals must be an array");
    return [];
  }

  return value.map((raw, index) => {
    if (!isObject(raw)) {
      issues.push(`input.goals[${index}] must be an object`);
      return { name: "", targetAmount: 0 };
    }

    const targetAmount = asNumber(raw.targetAmount);
    const horizonMonths = raw.horizonMonths === undefined ? undefined : asNumber(raw.horizonMonths);

    if (typeof raw.name !== "string") issues.push(`input.goals[${index}].name must be a string`);
    if (targetAmount === null) issues.push(`input.goals[${index}].targetAmount must be numeric`);
    if (raw.horizonMonths !== undefined && horizonMonths === null) issues.push(`input.goals[${index}].horizonMonths must be numeric`);

    return {
      name: typeof raw.name === "string" ? raw.name : "",
      targetAmount: targetAmount ?? 0,
      horizonMonths: horizonMonths === null ? undefined : horizonMonths,
    };
  });
}

function parseInput(value: unknown): { input: PlannerInput | null; issues: string[] } {
  const issues: string[] = [];
  if (!isObject(value)) {
    return { input: null, issues: ["input must be an object"] };
  }

  const monthlyIncomeNet = asNumber(value.monthlyIncomeNet);
  const monthlyFixedExpenses = asNumber(value.monthlyFixedExpenses);
  const monthlyVariableExpenses = asNumber(value.monthlyVariableExpenses);
  const liquidAssets = asNumber(value.liquidAssets);
  const otherAssets = value.otherAssets === undefined ? undefined : asNumber(value.otherAssets);

  if (monthlyIncomeNet === null) issues.push("input.monthlyIncomeNet must be numeric");
  if (monthlyFixedExpenses === null) issues.push("input.monthlyFixedExpenses must be numeric");
  if (monthlyVariableExpenses === null) issues.push("input.monthlyVariableExpenses must be numeric");
  if (liquidAssets === null) issues.push("input.liquidAssets must be numeric");
  if (value.otherAssets !== undefined && otherAssets === null) issues.push("input.otherAssets must be numeric");

  const debts = parseDebts(value.debts, issues);
  const goals = parseGoals(value.goals, issues);

  if (issues.length > 0) return { input: null, issues };

  return {
    input: {
      monthlyIncomeNet: monthlyIncomeNet ?? 0,
      monthlyFixedExpenses: monthlyFixedExpenses ?? 0,
      monthlyVariableExpenses: monthlyVariableExpenses ?? 0,
      liquidAssets: liquidAssets ?? 0,
      otherAssets: otherAssets ?? undefined,
      debts,
      goals,
    },
    issues,
  };
}

function parseAssumptions(value: unknown): Partial<PlannerAssumptions> {
  if (!isObject(value)) return {};
  return {
    emergencyTargetMonths: asNumber(value.emergencyTargetMonths) ?? undefined,
    minEmergencyMonthsBeforeDebtExtra: asNumber(value.minEmergencyMonthsBeforeDebtExtra) ?? undefined,
    highInterestAprPctThreshold: asNumber(value.highInterestAprPctThreshold) ?? undefined,
    dsrWarnPct: asNumber(value.dsrWarnPct) ?? undefined,
    annualReturnPct: asNumber(value.annualReturnPct) ?? undefined,
    applyReturnToSimulation: typeof value.applyReturnToSimulation === "boolean" ? value.applyReturnToSimulation : undefined,
    maxSimMonths: asNumber(value.maxSimMonths) ?? undefined,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = isObject(body) ? body : {};

    const { input, issues } = parseInput(payload.input);
    if (!input || issues.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: "Invalid input",
            issues,
          },
        },
        { status: 400 },
      );
    }

    const assumptions = clampPlannerAssumptions(parseAssumptions(payload.assumptions));
    const result = computePlanner(input, assumptions);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof PlannerInputError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: error.message,
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    console.error("[planner/compute] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Internal error",
        },
      },
      { status: 500 },
    );
  }
}
