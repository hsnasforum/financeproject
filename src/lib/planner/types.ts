export type PlannerDebt = {
  name: string;
  balance: number;
  aprPct: number;
  monthlyPayment: number;
};

export type PlannerGoal = {
  name: string;
  targetAmount: number;
  horizonMonths?: number;
};

export type PlannerInput = {
  monthlyIncomeNet: number;
  monthlyFixedExpenses: number;
  monthlyVariableExpenses: number;
  liquidAssets: number;
  otherAssets?: number;
  debts: PlannerDebt[];
  goals: PlannerGoal[];
};

export type PlannerAssumptions = {
  emergencyTargetMonths: number;
  minEmergencyMonthsBeforeDebtExtra: number;
  highInterestAprPctThreshold: number;
  dsrWarnPct: number;
  annualReturnPct: number;
  applyReturnToSimulation: boolean;
  maxSimMonths: number;
};

export type PlannerMetricLine = {
  key: string;
  label: string;
  value: number | null;
  unit?: "KRW" | "PCT" | "MONTHS" | "COUNT";
  formula?: string;
};

export type PlannerAction = {
  priority: "high" | "mid" | "low";
  title: string;
  action: string;
  reason: string;
  numbers?: Record<string, number>;
  link?: {
    href: string;
    label: string;
  };
};

export type PlannerGoalPlan = {
  name: string;
  targetAmount: number;
  horizonMonths?: number;
  suggestedMonthly: number;
  estimatedMonths: number | null;
  note: string;
};

export type PlannerResult = {
  metrics: PlannerMetricLine[];
  actions: PlannerAction[];
  emergencyPlan: {
    targetAmount: number;
    current: number;
    gap: number;
    suggestedMonthly: number;
    estimatedMonths: number | null;
    note: string;
  };
  debtPlan: {
    highInterestDebts: string[];
    focusDebt?: string;
    extraPaymentMonthly: number;
    estimatedPayoffMonths: number | null;
    note: string;
  };
  goalPlans: PlannerGoalPlan[];
  warnings: string[];
  assumptionsUsed: PlannerAssumptions;
  explain: {
    notes: string[];
  };
};

export class PlannerInputError extends Error {
  issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "PlannerInputError";
    this.issues = issues;
  }
}
