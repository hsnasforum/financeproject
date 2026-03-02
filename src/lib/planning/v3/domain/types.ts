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
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
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
