export type AccountTransaction = {
  date: string;
  amountKrw: number;
  description?: string;
  source: "csv";
  meta?: {
    rowIndex: number;
  };
};

export type MonthlyCashflow = {
  month?: string;
  inflowKrw?: number;
  outflowKrw?: number;
  fixedOutflowKrw?: number;
  variableOutflowKrw?: number;
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
  daysCovered?: number;
  notes?: string[];
};

export type CashflowDraftPatch = {
  suggestedMonthlyIncomeKrw: number;
  suggestedMonthlyEssentialSpendKrw: number;
  suggestedMonthlyDiscretionarySpendKrw: number;
  confidence: "high" | "mid" | "low";
  evidence: Array<{
    rule: string;
    valueKrw: number;
  }>;
};

export type ProfileV2DraftPatch = {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  assumptions: string[];
  monthsConsidered: number;
};

// Backward-compatible alias used by existing v3 wrappers/tests.
export type ProfileDraftPatch = ProfileV2DraftPatch;
