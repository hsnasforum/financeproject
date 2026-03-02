export type AccountTransactionSource = "csv";

export type AccountTransaction = {
  id: string;
  postedAt: string;
  amountKrw: number;
  description: string;
  category?: string;
  source: AccountTransactionSource;
};

export type MonthlyCashflow = {
  month: `${number}-${number}`;
  inflowKrw: number;
  outflowKrw: number;
  netKrw: number;
};

export type ProfileDraftPatch = {
  monthlyIncomeNet?: number;
  monthlyEssentialExpenses?: number;
  monthlyDiscretionaryExpenses?: number;
  notes?: string[];
};
