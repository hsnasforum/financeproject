import { type AllocationPolicyId } from "./policy/types";

export const REASON_CODES = [
  "NEGATIVE_CASHFLOW",
  "HIGH_DEBT_RATIO",
  "DEBT_NEGATIVE_AMORTIZATION",
  "DEBT_RATE_ASSUMED",
  "CONTRIBUTION_SKIPPED",
  "PHASES_OVERLAP",
  "EMERGENCY_FUND_DRAWDOWN",
  "INSOLVENT",
  "GOAL_MISSED",
  "GOAL_REACHED",
  "CASHFLOW_SCHEDULE",
  "INFLATION_DRAG",
  "RETURN_BOOST",
  "STEADY_PROGRESS",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type ExplainabilityMetaValue = string | number | boolean | null;
export type Money = number;

export type ProfileV2Debt = {
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  apr?: number;
  remainingMonths?: number;
  repaymentType?: "amortizing" | "interestOnly";
};

export type ProfileV2Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetMonth?: number;
  priority?: number;
  minimumMonthlyContribution?: number;
};

export type MonthRange = {
  startMonth: number;
  endMonth: number;
};

export type CashflowPhaseV2 = {
  id: string;
  title: string;
  range: MonthRange;
  monthlyIncomeKrw?: Money;
  monthlyFixedExpensesKrw?: Money;
  monthlyVariableExpensesKrw?: Money;
  incomeGrowthPctYoY?: number;
  expenseGrowthExtraPctYoY?: number;
};

export type PensionFlowV2 = {
  id: string;
  title: string;
  range: MonthRange;
  monthlyPayoutKrw: Money;
};

export type ContributionFlowV2 = {
  id: string;
  title: string;
  range: MonthRange;
  from: "cash";
  to: "investments" | "pension";
  monthlyAmountKrw: Money;
};

export type ProfileCashflowV2 = {
  monthlyIncomeKrw?: Money;
  monthlyFixedExpensesKrw?: Money;
  monthlyVariableExpensesKrw?: Money;
  phases?: CashflowPhaseV2[];
  pensions?: PensionFlowV2[];
  contributions?: ContributionFlowV2[];
  rules?: {
    phaseOverlapPolicy?: "sum" | "override";
  };
};

export type TaxProfileV1 = {
  regime: "KR";
  filingStatus?: "single" | "married";
  dependents?: number;
  notes?: string;
};

export type PensionProfileV1 = {
  regime: "KR";
  nationalPension?: {
    expectedMonthlyPayoutKrw?: number;
    startAge?: number;
  };
  retirementPension?: {
    type?: "DC" | "DB" | "IRP";
    expectedMonthlyPayoutKrw?: number;
    startAge?: number;
  };
  personalPension?: {
    expectedMonthlyPayoutKrw?: number;
    startAge?: number;
  };
  notes?: string;
};

export type ProfileV2 = {
  currentAge?: number;
  birthYear?: number;
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  liquidAssets: number;
  investmentAssets: number;
  debts: ProfileV2Debt[];
  goals: ProfileV2Goal[];
  cashflow?: ProfileCashflowV2;
  tax?: TaxProfileV1;
  pensionsDetailed?: PensionProfileV1;
};

export type SimulationAssumptionsV2 = {
  inflation: number;
  expectedReturn: number;
  debtRates?: Record<string, number>;
};

export type SimulationAssumptionsResolvedV2 = {
  annualInflationRate: number;
  annualExpectedReturnRate: number;
  monthlyInflationRate: number;
  monthlyExpectedReturnRate: number;
  annualDebtRates: Record<string, number>;
  monthlyDebtRates: Record<string, number>;
};

export type GoalStatusV2 = {
  goalId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  progressPct: number;
  achieved: boolean;
  achievedMonth: number | null;
  targetMonth: number;
  onTrack: boolean;
  shortfall: number;
};

export type SimulationWarningV2 = {
  reasonCode: ReasonCode;
  message: string;
  month?: number;
  meta?: Record<string, ExplainabilityMetaValue>;
};

export type ExplainabilityDriver =
  | "income"
  | "expenses"
  | "debtInterest"
  | "investmentReturn"
  | "debtPrincipalTransfer"
  | "goalFundingTransfer"
  | "netCashflow";

export type ExplainabilityDriverDelta = {
  driver: ExplainabilityDriver;
  amount: number;
  note?: string;
};

export type ExplainabilityEntryV2 = {
  reasonCode: ReasonCode;
  message: string;
  month: number;
  why: ExplainabilityDriverDelta[];
  meta?: Record<string, ExplainabilityMetaValue>;
};

export type DecisionTrace = {
  monthIndex?: number;
  code: string;
  message: string;
  data?: Record<string, unknown>;
  related?: Array<{ kind: string; id?: string }>;
};

export type TimelineRowV2 = {
  month: number;
  income: number;
  pensionIncome: number;
  expenses: number;
  operatingCashflow: number;
  debtPayment: number;
  debtInterest: number;
  debtPrincipalPaid: number;
  contributionToInvest: number;
  contributionToPension: number;
  goalContribution: number;
  investmentReturn: number;
  liquidAssets: number;
  investmentAssets: number;
  pensionAssets: number;
  goalFundAssets: number;
  totalDebt: number;
  netWorth: number;
  netWorthDelta: number;
  debtServiceRatio: number;
  goalProgress: Record<string, number>;
};

export type SimulationResultV2 = {
  assumptionsUsed: SimulationAssumptionsResolvedV2;
  timeline: TimelineRowV2[];
  goalStatus: GoalStatusV2[];
  warnings: SimulationWarningV2[];
  explainability: ExplainabilityEntryV2[];
  traces?: DecisionTrace[];
};

export type PlanResultV2 = SimulationResultV2;

export type SimulationRunOptionsV2 = {
  policyId?: AllocationPolicyId;
};

export type ValidationIssueV2 = {
  path: string;
  message: string;
};

export class PlanningV2ValidationError extends Error {
  readonly issues: ValidationIssueV2[];

  constructor(message: string, issues: ValidationIssueV2[]) {
    super(message);
    this.name = "PlanningV2ValidationError";
    this.issues = issues;
  }
}

export type ValidatedSimulationInputV2 = {
  profile: ProfileV2;
  assumptions: SimulationAssumptionsResolvedV2;
  horizonMonths: number;
  policyId: AllocationPolicyId;
};
