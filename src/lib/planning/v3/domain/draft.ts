export type V3DraftSource = {
  kind: "csv";
  filename?: string;
  rows?: number;
  months?: number;
};

export type V3DraftCashflowRow = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount?: number;
};

export type V3DraftSummary = {
  medianIncomeKrw?: number;
  medianExpenseKrw?: number;
  avgNetKrw?: number;
  notes?: string[];
};

export type V3DraftRecord = {
  id: string;
  createdAt: string;
  source: V3DraftSource;
  cashflow: V3DraftCashflowRow[];
  draftPatch: Record<string, unknown>;
  summary: V3DraftSummary;
};

