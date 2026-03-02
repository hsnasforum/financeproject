export type AccountTransaction = {
  id: string;
  date: `${number}-${number}-${number}`;
  amount: number;
  desc?: string;
  source: "csv";
  meta?: {
    rowIndex: number;
  };
};

export type MonthlyCashflow = {
  ym: `${number}-${number}`;
  income: number;
  expense: number;
  net: number;
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
