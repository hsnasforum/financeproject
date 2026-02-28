export type ActionSeverity = "info" | "warn" | "critical";

export type ActionCode =
  | "BUILD_EMERGENCY_FUND"
  | "FIX_NEGATIVE_CASHFLOW"
  | "REDUCE_DEBT_SERVICE"
  | "COVER_LUMP_SUM_GOAL"
  | "IMPROVE_RETIREMENT_PLAN"
  | "SET_ASSUMPTIONS_REVIEW";

export type ProductCandidate = {
  kind: "deposit" | "saving";
  finPrdtCd: string;
  company: string;
  name: string;
  termMonths?: number;
  rateMinPct?: number;
  rateMaxPct?: number;
  notes?: string[];
  whyThis?: string[];
};

export type ActionItemV2 = {
  code: ActionCode;
  severity: ActionSeverity;
  title: string;
  summary: string;
  why: Array<{ code: string; message: string; data?: unknown }>;
  metrics: Record<string, number>;
  steps: string[];
  candidates?: ProductCandidate[];
  cautions: string[];
};
